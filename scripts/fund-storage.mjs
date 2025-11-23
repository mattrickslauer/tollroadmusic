import "dotenv/config"
import { Synapse, RPC_URLS, TIME_CONSTANTS } from "@filoz/synapse-sdk"
import { ethers } from "ethers"
function main() {
  return (async function () {
    function requireEnv(name) {
      const v = process.env[name]
      if (!v || v.length === 0) {
        throw new Error(name + " missing")
      }
      return v
    }
    const synapse = await Synapse.create({
      privateKey: requireEnv("METAMASK_PRIVATE_KEY"),
      rpcURL: RPC_URLS.calibration.http,
    })
    const depositAmount = ethers.parseUnits("2.5", 18)
    const tx = await synapse.payments.depositWithPermitAndApproveOperator(
      depositAmount,
      synapse.getWarmStorageAddress(),
      ethers.MaxUint256,
      ethers.MaxUint256,
      TIME_CONSTANTS.EPOCHS_PER_MONTH,
    )
    await tx.wait()
    console.log("✅ USDFC deposit and Warm Storage service approval successful!")
    const data = new TextEncoder().encode(
      `🚀 Welcome to decentralized storage on Filecoin Onchain Cloud!
    Your data is safe here.
    🌍 You need to make sure to meet the minimum size
    requirement of 127 bytes per upload.`,
    )
    const { pieceCid, size } = await synapse.storage.upload(data)
    console.log("✅ Upload complete!")
    console.log("PieceCID:", pieceCid)
    console.log("Size:", size, "bytes")
    const bytes = await synapse.storage.download(pieceCid)
    const decodedText = new TextDecoder().decode(bytes)
    console.log("✅ Download successful!")
    console.log("Downloaded data:", decodedText)
    console.log("🎉 Data storage and retrieval successful!")
  })()
}
main().then(function () {
  console.log("✅ Storage workflow completed successfully!")
}).catch(function (error) {
  console.error("❌ Error occurred:")
  console.error(error.message)
  console.error(error.cause)
})


