import org.jetbrains.kotlin.gradle.dsl.KotlinVersion

plugins {
    kotlin("jvm")
    kotlin("plugin.serialization")
}

repositories { mavenCentral() }

kotlin {
    jvmToolchain(21)
    compilerOptions {
        // Match the Kotlin runtime bundled with IntelliJ 2025.1+, which the plugin uses at runtime.
        apiVersion.set(KotlinVersion.KOTLIN_2_1)
        languageVersion.set(KotlinVersion.KOTLIN_2_1)
    }
}

dependencies {
    compileOnly(kotlin("stdlib"))
    // The IDE ships kotlinx.coroutines; the plugin module excludes it from the bundle.
    api("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")
    api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    testImplementation(kotlin("stdlib"))
    testImplementation(kotlin("test-junit5"))
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.test { useJUnitPlatform() }
