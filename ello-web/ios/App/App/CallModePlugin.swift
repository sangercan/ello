import Foundation
import Capacitor
import AVFoundation
import UIKit

@objc(CallModePlugin)
public class CallModePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CallModePlugin"
    public let jsName = "CallMode"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise)
    ]

    @objc func enable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = true

            let session = AVAudioSession.sharedInstance()
            do {
                try session.setCategory(
                    .playAndRecord,
                    mode: .voiceChat,
                    options: [.allowBluetooth, .allowBluetoothA2DP, .defaultToSpeaker, .duckOthers]
                )
                try session.setActive(true)
                call.resolve()
            } catch {
                call.reject("Nao foi possivel ativar o modo de chamada: \(error.localizedDescription)")
            }
        }
    }

    @objc func disable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = false

            do {
                try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
                call.resolve()
            } catch {
                call.reject("Nao foi possivel desativar o modo de chamada: \(error.localizedDescription)")
            }
        }
    }
}

