package expo.modules.bropose

import android.content.pm.PackageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BroPoseModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BroPose")

    // hay alguna cámara en el teléfono
    Function("hasCamera") {
      val ctx = appContext.reactContext ?: return@Function false
      ctx.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)
    }

    View(BroPoseView::class) {
      Events("onPose", "onPoseError", "onPoseReady")

      Prop("facing") { view: BroPoseView, facing: String? ->
        view.setFacing(facing ?: "front")
      }

      Prop("active") { view: BroPoseView, active: Boolean? ->
        view.setActive(active ?: true)
      }

      OnViewDestroys { view: BroPoseView ->
        view.release()
      }
    }
  }
}
