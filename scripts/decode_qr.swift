#!/usr/bin/env swift

import Foundation
import Vision
import CoreImage

private func emit(_ object: [String: Any], status: Int32) -> Never {
    if let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]) {
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([0x0A]))
    }
    exit(status)
}

private func emitDetection(count: Int, payload: String?) -> Never {
    guard count == 1, let payload else {
        // Never echo any payload when the image is ambiguous.
        emit(["count": count], status: count == 1 ? 3 : 2)
    }
    emit(["count": 1, "payload": payload], status: 0)
}

private func coreImageDetection(at url: URL) throws -> (Int, String?) {
    let context = CIContext(options: [CIContextOption.useSoftwareRenderer: true])
    guard let image = CIImage(contentsOf: url),
          let detector = CIDetector(
            ofType: CIDetectorTypeQRCode,
            context: context,
            options: [CIDetectorAccuracy: CIDetectorAccuracyHigh]
          ) else {
        throw NSError(domain: "xplora.ticket-intake", code: 1)
    }
    let features = detector.features(in: image).compactMap { $0 as? CIQRCodeFeature }
    return (features.count, features.count == 1 ? features[0].messageString : nil)
}

guard CommandLine.arguments.count == 2 else {
    emit(["count": 0, "error": "invalid_arguments"], status: 64)
}

let imageURL = URL(fileURLWithPath: CommandLine.arguments[1])
let request = VNDetectBarcodesRequest()
request.symbologies = [.qr]

do {
    let handler = VNImageRequestHandler(url: imageURL, options: [:])
    try handler.perform([request])
    let observations = (request.results ?? []).filter { $0.symbology == .qr }
    emitDetection(
        count: observations.count,
        payload: observations.count == 1 ? observations[0].payloadStringValue : nil
    )
} catch {
    // Some hardened local runners cannot create Vision's inference context.
    // CoreImage is the system fallback; errors still omit paths/provider text.
    do {
        let detection = try coreImageDetection(at: imageURL)
        emitDetection(count: detection.0, payload: detection.1)
    } catch {
        emit(["count": 0, "error": "decode_failed"], status: 3)
    }
}
