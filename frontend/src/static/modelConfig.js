import { FetchGet } from '../utils/apiHelper'

// Model lists are loaded from the backend (GET /v1/model/list, defined in backend/models.yaml) before the
// app renders, so adding a model only means editing models.yaml. `modelGroups` is filled in place, so
// components can keep importing it synchronously.

// Default structured-output schema offered for video understanding models (editable in the UI)
export const DEFAULT_TOOL_CONFIG = {
  toolChoice: {
    tool: {
      name: 'video_analysis'
    }
  },
  tools: [{
    toolSpec: {
      name: 'video_analysis',
      description: 'Analyze video and return structured information with key moments. Each moment should represent a meaningful scene or segment, NOT individual seconds. Group related content into coherent time ranges (e.g., 5-30 seconds per moment depending on content).',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description: 'A high-level summary of the entire video content.'
            },
            key_moments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: {
                    type: 'string',
                    description: 'A detailed description of what happens in this moment.'
                  },
                  start_time: {
                    type: 'number',
                    description: 'Start time of the moment in seconds. Each moment should span multiple seconds representing a complete scene or action, not just 1 second.'
                  },
                  end_time: {
                    type: 'number',
                    description: 'End time of the moment in seconds. Should be significantly later than start_time to represent a meaningful scene duration.'
                  }
                },
                required: ['description', 'start_time', 'end_time']
              }
            }
          },
          required: ['description', 'key_moments']
        }
      }
    }
  }]
}

export const modelGroups = [
  { groupName: 'Multimodal Embedding', models: [] },
  { groupName: 'Video Understanding', models: [] },
]

const toPricing = (p) => (p ? { ...p, unit: p.unit || 'USD' } : undefined)

function toEmbeddingModel(m) {
  return {
    displayName: m.name,
    modelId: m.id,
    api: '/model/start-embedding',
    parameterType: 'openai-embed',
    dims: m.dims ? [m.dims] : [],
    maxVideoSeconds: m.maxClipSeconds || undefined,
    parameters: m.parameters || [],
    provider: m.provider,
    pricing: toPricing(m.pricing),
  }
}

function toVideoUnderstandingModel(m) {
  return {
    displayName: m.name,
    modelId: m.id,
    api: '/model/start-video-understanding',
    apiType: m.apiType,
    provider: m.provider,
    toolConfig: DEFAULT_TOOL_CONFIG,
    pricing: toPricing(m.pricing),
  }
}

export async function loadModelGroups() {
  try {
    const { models } = await FetchGet('/model/list')
    const usable = (models || []).filter(m => m.available)
    const fill = (groupName, items) => {
      const group = modelGroups.find(g => g.groupName === groupName)
      group.models.splice(0, group.models.length, ...items)
    }
    fill('Multimodal Embedding', usable.filter(m => m.task === 'embedding').map(toEmbeddingModel))
    fill('Video Understanding', usable.filter(m => m.task === 'video_understanding').map(toVideoUnderstandingModel))
  } catch (err) {
    console.error('Could not load the model list from the backend:', err)
  }
}
