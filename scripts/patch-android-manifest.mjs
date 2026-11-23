import fs from "node:fs";

const manifestPath = "android/app/src/main/AndroidManifest.xml";
if (!fs.existsSync(manifestPath)) {
  throw new Error("No se encontró el AndroidManifest.xml generado por Capacitor.");
}

let xml = fs.readFileSync(manifestPath, "utf8");
const cameraPermission = '<uses-permission android:name="android.permission.CAMERA" />';
if (!xml.includes('android.permission.CAMERA')) {
  const applicationTag = /\s*<application\b/i;
  if (!applicationTag.test(xml)) {
    throw new Error("No se encontró la etiqueta <application> en AndroidManifest.xml.");
  }
  xml = xml.replace(applicationTag, `\n    ${cameraPermission}\n\n    <application`);
}
const cameraFeature = '<uses-feature android:name="android.hardware.camera" android:required="false" />';
if (!xml.includes('android.hardware.camera')) {
  xml = xml.replace(cameraPermission, cameraPermission + "\n    " + cameraFeature);
}
fs.writeFileSync(manifestPath, xml, "utf8");
console.log("Permiso de cámara añadido al manifiesto Android.");
