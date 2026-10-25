package expo.modules.bropose

import android.annotation.SuppressLint
import android.content.Context
import android.os.SystemClock
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.UseCase
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import android.util.Size
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.pose.PoseDetection
import com.google.mlkit.vision.pose.PoseDetector
import com.google.mlkit.vision.pose.defaults.PoseDetectorOptions
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

// Vista de cámara con detección de pose en el teléfono (ML Kit, sin internet).
// No guarda ni sube imágenes: cada cuadro se analiza en memoria y se descarta.
// A JS solo le llegan los 33 puntos del cuerpo (x, y normalizados 0..1 y confianza).
@SuppressLint("ViewConstructor")
class BroPoseView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onPose by EventDispatcher()
  private val onPoseError by EventDispatcher()
  private val onPoseReady by EventDispatcher()

  private val previewView = PreviewView(context).apply {
    scaleType = PreviewView.ScaleType.FILL_CENTER
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
  }

  private var facing = "front"
  private var active = true
  private var bound = false
  private var provider: ProcessCameraProvider? = null
  private var useCases: List<UseCase> = emptyList()
  private var analysisCase: ImageAnalysis? = null
  private var executor: ExecutorService? = null
  private var detector: PoseDetector? = null
  private val busy = AtomicBoolean(false)
  private var lastSent = 0L
  @Volatile private var released = false

  init {
    addView(previewView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  // RN no hace layout de las vistas nativas hijas: lo hacemos a mano
  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    previewView.layout(0, 0, r - l, b - t)
  }

  override fun requestLayout() {
    super.requestLayout()
    post {
      measure(
        MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
        MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
      )
      layout(left, top, right, bottom)
    }
  }

  fun setFacing(value: String) {
    if (value == facing) return
    facing = value
    if (bound) { unbind(); bind() }
  }

  fun setActive(value: Boolean) {
    active = value
    if (!value) unbind() else if (isAttachedToWindow) bind()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (active) bind()
  }

  override fun onDetachedFromWindow() {
    unbind()
    super.onDetachedFromWindow()
  }

  private fun emitError(msg: String) {
    try { onPoseError(mapOf("message" to msg)) } catch (_: Throwable) {}
  }

  private fun bind() {
    if (bound || released) return
    val owner = appContext.currentActivity as? LifecycleOwner
    if (owner == null) { emitError("no-activity"); return }
    bound = true
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      try {
        if (!bound || released) return@addListener
        val p = future.get()
        provider = p
        val selector = if (facing == "back") CameraSelector.DEFAULT_BACK_CAMERA else CameraSelector.DEFAULT_FRONT_CAMERA
        val chosen = if (p.hasCamera(selector)) selector
          else if (p.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA)) CameraSelector.DEFAULT_BACK_CAMERA
          else if (p.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA)) CameraSelector.DEFAULT_FRONT_CAMERA
          else null
        if (chosen == null) { bound = false; emitError("no-camera"); return@addListener }

        val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
        val analysis = ImageAnalysis.Builder()
          .setResolutionSelector(
            ResolutionSelector.Builder()
              .setResolutionStrategy(
                ResolutionStrategy(Size(640, 480), ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER)
              )
              .build()
          )
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
          .build()
        val ex = Executors.newSingleThreadExecutor()
        executor = ex
        val det = PoseDetection.getClient(
          PoseDetectorOptions.Builder().setDetectorMode(PoseDetectorOptions.STREAM_MODE).build()
        )
        detector = det
        val mirrored = chosen == CameraSelector.DEFAULT_FRONT_CAMERA
        analysis.setAnalyzer(ex) { image -> analyze(image, det, mirrored) }
        analysisCase = analysis

        // solo desatamos lo nuestro (no unbindAll: no tocamos otras cámaras de la app)
        val cases = listOf<UseCase>(preview, analysis)
        p.bindToLifecycle(owner, chosen, *cases.toTypedArray())
        useCases = cases
        onPoseReady(mapOf("facing" to (if (mirrored) "front" else "back")))
      } catch (e: Throwable) {
        Log.w("BroPose", "bind failed", e)
        bound = false
        emitError(e.message ?: e.javaClass.simpleName)
      }
    }, ContextCompat.getMainExecutor(context))
  }

  @SuppressLint("UnsafeOptInUsageError")
  private fun analyze(image: ImageProxy, det: PoseDetector, mirrored: Boolean) {
    val media = image.image
    val now = SystemClock.elapsedRealtime()
    // ~15 cuadros por segundo alcanzan para contar reps y no calientan el teléfono
    if (media == null || released || now - lastSent < 60 || !busy.compareAndSet(false, true)) {
      image.close(); return
    }
    val rot = image.imageInfo.rotationDegrees
    val w = if (rot == 90 || rot == 270) image.height else image.width
    val h = if (rot == 90 || rot == 270) image.width else image.height
    val input = InputImage.fromMediaImage(media, rot)
    det.process(input)
      .addOnSuccessListener { pose ->
        if (released) return@addOnSuccessListener
        lastSent = SystemClock.elapsedRealtime()
        val pts = ArrayList<Double>(33 * 3)
        val all = pose.allPoseLandmarks
        if (all.size >= 33) {
          for (i in 0 until 33) {
            val lm = pose.getPoseLandmark(i)
            if (lm == null) { pts.add(0.0); pts.add(0.0); pts.add(0.0); continue }
            pts.add((lm.position.x / w).toDouble())
            pts.add((lm.position.y / h).toDouble())
            pts.add(lm.inFrameLikelihood.toDouble())
          }
        }
        try {
          onPose(mapOf("t" to lastSent.toDouble(), "w" to w, "h" to h, "mirrored" to mirrored, "points" to pts))
        } catch (_: Throwable) {}
      }
      .addOnFailureListener { /* cuadro perdido: sigue con el próximo */ }
      .addOnCompleteListener {
        busy.set(false)
        image.close()
      }
  }

  private fun unbind() {
    if (!bound) return
    bound = false
    try { if (useCases.isNotEmpty()) provider?.unbind(*useCases.toTypedArray()) } catch (_: Throwable) {}
    useCases = emptyList()
    try { analysisCase?.clearAnalyzer() } catch (_: Throwable) {}
    analysisCase = null
    try { detector?.close() } catch (_: Throwable) {}
    detector = null
    executor?.shutdown()
    executor = null
  }

  fun release() {
    released = true
    unbind()
  }
}
