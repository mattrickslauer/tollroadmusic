import { Synapse, RPC_URLS } from '@filoz/synapse-sdk'

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
