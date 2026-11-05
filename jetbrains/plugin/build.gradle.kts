import org.jetbrains.kotlin.gradle.dsl.KotlinVersion

plugins {
    kotlin("jvm")
    id("org.jetbrains.intellij.platform")
}

repositories {
    mavenCentral()
    intellijPlatform { defaultRepositories() }
}

kotlin {
    jvmToolchain(21)
    compilerOptions {
        apiVersion.set(KotlinVersion.KOTLIN_2_1)
        languageVersion.set(KotlinVersion.KOTLIN_2_1)
    }
}

dependencies {
    implementation(project(":core")) {
        // The IDE provides kotlinx.coroutines; bundling a second copy breaks the plugin at runtime.
        exclude(group = "org.jetbrains.kotlinx", module = "kotlinx-coroutines-core")
        exclude(group = "org.jetbrains.kotlinx", module = "kotlinx-coroutines-core-jvm")
    }
    intellijPlatform {
        intellijIdeaCommunity(providers.gradleProperty("platformVersion"))
        pluginVerifier()
        zipSigner()
    }
}

// "What's new" on Marketplace: the bullets of the newest section in jetbrains/CHANGELOG.md.
val releaseNotes = providers.fileContents(rootProject.layout.projectDirectory.file("CHANGELOG.md")).asText.map { text ->
    val section = text.substringAfter("\n## ", "").substringAfter("\n").substringBefore("\n## ")
    val items = section.lines().map { it.trim() }.filter { it.startsWith("- ") }.joinToString("") { line ->
        "<li>" + line.removePrefix("- ").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;") + "</li>"
    }
    if (items.isEmpty()) "" else "<ul>$items</ul>"
}

intellijPlatform {
    projectName = "pair-flow-jetbrains"
    pluginConfiguration {
        version = providers.gradleProperty("version")
        changeNotes = releaseNotes
        ideaVersion {
            sinceBuild = providers.gradleProperty("pluginSinceBuild")
            untilBuild = provider { null }
        }
    }
    signing {
        certificateChain = providers.environmentVariable("CERTIFICATE_CHAIN")
        privateKey = providers.environmentVariable("PRIVATE_KEY")
        password = providers.environmentVariable("PRIVATE_KEY_PASSWORD")
    }
    publishing {
        token = providers.environmentVariable("PUBLISH_TOKEN")
    }
    pluginVerification {
        ides { recommended() }
    }
}

// The panel UI is shared with the VS Code extension: bundle it from the repository root with Node.
val repoRoot: File = rootProject.projectDir.parentFile
val webviewOut = layout.buildDirectory.dir("generated/webview-resources")
val buildWebview by tasks.registering(Exec::class) {
    description = "Bundles the shared Pair Flow panel UI (requires `npm ci` at the repository root)."
    workingDir = repoRoot
    commandLine("node", "scripts/build-jetbrains-ui.mjs", webviewOut.get().dir("webview").asFile.absolutePath)
    inputs.files(
        File(repoRoot, "scripts/build-jetbrains-ui.mjs"),
        File(repoRoot, "src/ui/webviewHtml.ts"),
        File(repoRoot, "src/ui/browserEntry.ts"),
        File(repoRoot, "media/main.js"),
        File(repoRoot, "media/main.css"),
    )
    outputs.dir(webviewOut)
}

sourceSets.main { resources.srcDir(webviewOut) }
tasks.processResources { dependsOn(buildWebview) }
