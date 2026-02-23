export const modelGroups = [
  {
    groupName: 'Multimodal Embedding',
    models: [
      {
        displayName: 'Nova MME',
        modelId: 'amazon.nova-2-multimodal-embeddings-v1:0',
        api: '/video/start-nova-mme',
        parameterType: 'nova-mme',
        dims: [1024, 3072, 384, 256]
      },
      {
        displayName: 'TwelveLabs Marengo 3.0',
        modelId: 'twelvelabs.marengo-embed-3-0-v1:0',
        api: '/video/start-tlabs-mme',
        parameterType: 'twelvelabs',
        dims: [512]
      },
    ],
  },
  {
    groupName: 'Video Understanding',
    models: [
      {
        displayName: 'Nova Lite 1',
        modelId: '',
        api: '/video/start-understanding-nova-lite-1'
      },
      {
        displayName: 'Nova Lite 2',
        modelId: '',
        api: '/video/start-understanding-nova-lite-2'
      },
      {
        displayName: 'Nova Pro 1',
        modelId: '',
        api: '/video/start-understanding-nova-pro-1'
      },
      {
        displayName: 'Nova Pro 2',
        modelId: '',
        api: '/video/start-understanding-nova-pro-2'
      },
      {
        displayName: 'TwelveLabs Pegasus 3',
        modelId: '',
        api: '/video/start-understanding-twelvelabs-pegasus-3'
      },
      {
        displayName: 'Gemini',
        modelId: '',
        api: '/video/start-understanding-gemini'
      },
    ],
  },
  {
    groupName: 'Image Frame Based',
    models: [
      {
        displayName: 'Nova 1 Lite',
        modelId: '',
        api: '/video/start-frame-nova-1-lite'
      },
      {
        displayName: 'Nova 2 Lite',
        modelId: '',
        api: '/video/start-frame-nova-2-lite'
      },
      {
        displayName: 'Nova 1 Pro',
        modelId: '',
        api: '/video/start-frame-nova-1-pro'
      },
      {
        displayName: 'Nova 2 Pro',
        modelId: '',
        api: '/video/start-frame-nova-2-pro'
      },
      {
        displayName: 'Llama',
        modelId: '',
        api: '/video/start-frame-llama'
      },
      {
        displayName: 'OpenAI',
        modelId: '',
        api: '/video/start-frame-openai'
      },
      {
        displayName: 'Gemini',
        modelId: '',
        api: '/video/start-frame-gemini'
      },
    ],
  },
  {
    groupName: 'Video Clip Based',
    models: [
      {
        displayName: 'Nova Lite 1',
        modelId: '',
        api: '/video/start-clip-nova-lite-1'
      },
      {
        displayName: 'Nova Lite 2',
        modelId: '',
        api: '/video/start-clip-nova-lite-2'
      },
      {
        displayName: 'Nova Pro 1',
        modelId: '',
        api: '/video/start-clip-nova-pro-1'
      },
      {
        displayName: 'Nova Pro 2',
        modelId: '',
        api: '/video/start-clip-nova-pro-2'
      },
    ],
  },
]
