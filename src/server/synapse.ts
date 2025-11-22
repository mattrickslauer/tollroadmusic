import { Synapse, RPC_URLS } from '@filoz/synapse-sdk'
import { MaxUint256 } from 'ethers'

let synapsePromise: Promise<ReturnType<typeof Synapse.create>> | null = null

function requireEnv(name: string) {
  const v = process.env[name]
  if (!v || v.length === 0) {
    throw new Error(name + ' missing')
  }
  return v
}

export function getSynapse() {
  if (!synapsePromise) {
    const pk = requireEnv('METAMASK_PRIVATE_KEY')
    const rpc = RPC_URLS.calibration.http
    synapsePromise = Synapse.create({ privateKey: pk, rpcURL: rpc })
  }
  return synapsePromise
}

export function getDatasetId() {
  return process.env.FOC_DATASET_ID || ''
}

export async function depositUsdfc(amountWei: bigint, operator: string) {
  if (!operator || operator.length === 0) {
    throw new Error('operator missing')
  }
  const s = await getSynapse()
  const tx = await s.payments.depositWithPermitAndApproveOperator(amountWei, operator, MaxUint256, MaxUint256, 0n)
  return tx
}


