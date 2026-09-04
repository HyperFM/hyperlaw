import Capacitor
import StoreKit

/// Native StoreKit 2 bridge for the iOS pay-as-you-go top-up (Apple Guideline
/// 3.1.1 fix). Deliberately minimal — this app only sells one consumable
/// product; there's no need for the full receipt/entitlement machinery a
/// subscription-heavy app would use.
///
/// Never trust decoded transaction fields on the JS side for crediting —
/// `jwsRepresentation` (the raw signed transaction) is what gets POSTed to
/// the backend, which independently verifies it against Apple's servers
/// before crediting anything. See artifacts/api-server/src/appleIapClient.ts.
@objc(HyperLawIAPPlugin)
public class HyperLawIAPPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HyperLawIAPPlugin"
    public let jsName = "HyperLawIAP"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
    ]

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId is required")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("Unknown product: \(productId)")
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        call.resolve([
                            "transactionId": String(transaction.id),
                            "originalTransactionId": String(transaction.originalID),
                            "productId": transaction.productID,
                            "jwsRepresentation": verification.jwsRepresentation,
                        ])
                    case .unverified(_, let error):
                        call.reject("Transaction could not be verified on-device: \(error.localizedDescription)")
                    }
                case .userCancelled:
                    call.reject("Purchase cancelled", "user_cancelled")
                case .pending:
                    call.reject("Purchase pending (e.g. Ask to Buy) — not completed yet", "pending")
                @unknown default:
                    call.reject("Unknown purchase result")
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// Must be called once the backend has confirmed the transaction was
    /// credited (200) or was already credited on a prior attempt (409) — until
    /// finished, StoreKit will keep re-presenting it as unfinished on relaunch.
    @objc func finishTransaction(_ call: CAPPluginCall) {
        guard let transactionIdStr = call.getString("transactionId"),
              let transactionId = UInt64(transactionIdStr) else {
            call.reject("transactionId is required")
            return
        }
        Task {
            for await result in Transaction.unfinished {
                guard case .verified(let transaction) = result, transaction.id == transactionId else { continue }
                await transaction.finish()
                call.resolve()
                return
            }
            // Nothing found to finish — already finished previously. Not an error.
            call.resolve()
        }
    }

    /// Safety net Apple expects even for consumables — re-syncs any purchase
    /// that didn't make it back to this device (e.g. app was killed mid-flow).
    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }
}
