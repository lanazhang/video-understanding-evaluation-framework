// Embedding tasks come in three flavours: the two Bedrock ones from the original app ('nova-mme',
// 'tlabs-mme') and the provider-based one ('embedding', e.g. Qwen3-VL on Brev) used by the local runtime.
const EMBEDDING_TYPES = ['nova-mme', 'tlabs-mme', 'embedding']

export const isEmbeddingTask = (task) => EMBEDDING_TYPES.includes(task?.Type)

// Short label for a task's embedding type, shown next to the model id
export function embeddingLabel(task) {
  if (task?.Type === 'nova-mme') return 'Nova MME'
  if (task?.Type === 'tlabs-mme') return 'TwelveLabs'
  return 'Embedding'
}

// Backend route that searches this task's vectors
export function searchEndpoint(task) {
  if (task?.Type === 'tlabs-mme') return '/model/tlabs-mme-search-vector'
  if (task?.Type === 'embedding') return '/model/embedding-search'
  return '/model/nova-mme-search-vector'
}
