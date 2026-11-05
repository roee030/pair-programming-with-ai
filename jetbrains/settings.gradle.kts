rootProject.name = "pair-flow-jetbrains"

pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

include(":core")
if (System.getenv("PAIRFLOW_CORE_ONLY") != "1") include(":plugin")
