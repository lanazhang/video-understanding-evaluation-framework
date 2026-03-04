export const modelGroups = [
  {
    groupName: 'Multimodal Embedding',
    models: [
      {
        displayName: 'Nova MME',
        modelId: 'amazon.nova-2-multimodal-embeddings-v1:0',
        api: '/model/start-nova-mme',
        parameterType: 'nova-mme',
        dims: [1024, 3072, 384, 256],
        //maxContextTokens: 8000,
        //maxVideoSeconds: 30,
        //maxAudioSeconds: 30,
        maxVideoSizeGB: 1.5,
        //maxAudioSizeGB: 1.0,
        //supportedLanguages: 200,
        pricing: {
          url: "https://aws.amazon.com/bedrock/pricing/",
          perMinuteVideo: 0.042, //0.0007 per second
          //perImage: 0.0001,
          //perTextQuery: 0.00007,
          unit: 'USD',
          //notes: 'Video: $0.00049/sec, Image: $0.0001/image, Text: $0.00007/query'
        }
      },
      {
        displayName: 'TwelveLabs Marengo 3.0',
        modelId: 'twelvelabs.marengo-embed-3-0-v1:0',
        api: '/model/start-tlabs-mme',
        parameterType: 'twelvelabs',
        dims: [512],
        maxDurationMinutes: 240, // 4 hours
        maxSizeGB: 6,
        //maxTextTokens: 500,
        //maxImageSize: 5, // 5 MB
        //supportedLanguages: 36,
        pricing: {
          url: "https://aws.amazon.com/bedrock/pricing/",
          perMinuteVideo: 0.042, // $0.00070 per second = $0.042 per minute
          //perImage: 0.0001,
          //perTextQuery: 0.00007,
          unit: 'USD',
          //notes: 'Video: $0.00070/sec, Image: $0.0001/image, Text: $0.00007/query'
        }
      },
    ],
  },
  {
    groupName: 'Video Understanding',
    models: [
      {
        displayName: 'Nova 2 Lite',
        modelId: 'us.amazon.nova-2-lite-v1:0',
        api: '/model/start-video-understanding',
        apiType: 'bedrock_converse',
        maxDurationMinutes: 60,
        maxSizeGB: 2,
        pricing: {
          url: "https://aws.amazon.com/bedrock/pricing/",
          inputTokensPer1M: 0.30,
          outputTokensPer1M: 2.50,
          unit: 'USD',
          //notes: 'Input: $0.06/1M tokens, Output: $0.24/1M tokens'
        },
        toolConfig: {
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
      },
      {
        displayName: 'Nova Lite',
        modelId: 'amazon.nova-lite-v1:0',
        api: '/model/start-video-understanding',
        apiType: 'bedrock_converse',
        maxDurationMinutes: 60,
        maxSizeGB: 2,
        pricing: {
          url: "https://aws.amazon.com/bedrock/pricing/",
          inputTokensPer1M: 0.06,
          outputTokensPer1M: 0.24,
          unit: 'USD',
          //notes: 'Input: $0.06/1M tokens, Output: $0.24/1M tokens'
        },
        toolConfig: {
          toolChoice: {
            tool: {
              name: 'video_scene_analysis'
            }
          },
          tools: [{
            toolSpec: {
              name: 'video_scene_analysis',
              description: 'Analyze video and return structured scene information with timestamps',
              inputSchema: {
                json: {
                  type: 'object',
                  properties: {
                    scenes: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          start_time: {
                            type: 'string',
                            description: 'Start time of the moment in seconds. Each moment should span multiple seconds representing a complete scene or action, not just 1 second.'
                          },
                          end_time: {
                            type: 'string',
                            description: 'Start time of the moment in seconds. Each moment should span multiple seconds representing a complete scene or action, not just 1 second.'
                          },
                          description: {
                            type: 'string',
                            description: 'Start time of the moment in seconds. Each moment should span multiple seconds representing a complete scene or action, not just 1 second.'
                          }
                        },
                        required: ['start_time', 'end_time', 'description']
                      }
                    }
                  },
                  required: ['scenes']
                }
              }
            }
          }]
        }
      },
      {
        displayName: 'Nova Pro',
        modelId: 'amazon.nova-pro-v1:0',
        api: '/model/start-video-understanding',
        apiType: 'bedrock_converse',
        maxDurationMinutes: 60,
        maxSizeGB: 2,
        pricing: {
          url: "https://aws.amazon.com/bedrock/pricing/",
          inputTokensPer1M: 0.80,
          outputTokensPer1M: 3.20,
          unit: 'USD',
          //notes: 'Input: $0.80/1M tokens, Output: $3.20/1M tokens'
        },
        toolConfig: {
          toolChoice: {
            tool: {
              name: 'video_scene_analysis'
            }
          },
          tools: [{
            toolSpec: {
              name: 'video_scene_analysis',
              description: 'Analyze video and return structured scene information with timestamps',
              inputSchema: {
                json: {
                  type: 'object',
                  properties: {
                    scenes: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          start_time: {
                            type: 'string',
                            description: 'Start timestamp in format MM:SS or HH:MM:SS'
                          },
                          end_time: {
                            type: 'string',
                            description: 'End timestamp in format MM:SS or HH:MM:SS'
                          },
                          description: {
                            type: 'string',
                            description: 'Description of what happens in this scene'
                          }
                        },
                        required: ['start_time', 'end_time', 'description']
                      }
                    }
                  },
                  required: ['scenes']
                }
              }
            }
          }]
        }
      },
      {
        displayName: 'Nova 2 Omni',
        modelId: 'us.amazon.nova-2-omni-v1:0',
        api: '/model/start-video-understanding',
        apiType: 'bedrock_converse',
        maxDurationMinutes: 60,
        maxSizeGB: 2,
        pricing: {
          url: "https://aws.amazon.com/bedrock/pricing/",
          inputTokensPer1M: 0.30,
          outputTokensPer1M: 2.50,
          unit: 'USD',
          //notes: 'Input: $0.80/1M tokens, Output: $3.20/1M tokens'
        },
        toolConfig: {
          toolChoice: {
            tool: {
              name: 'video_analysis'
            }
          },
          tools: [{
            toolSpec: {
              name: 'video_analysis',
              description: 'Analyze video and return structured information with key moments',
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
                            description: 'Start time of the moment in seconds.'
                          },
                          end_time: {
                            type: 'number',
                            description: 'End time of the moment in seconds.'
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
      },
      {
        displayName: 'TwelveLabs Pegasus',
        modelId: 'twelvelabs.pegasus-1-2-v1:0',
        api: '/model/start-video-understanding',
        apiType: 'tlabs_pegasus',
        maxDurationMinutes: 60,
        maxSizeGB: 2,
        maxPromptTokens: 2000,
        maxOutputTokens: 4096,
        pricing: {
          url: "https://aws.amazon.com/bedrock/pricing/",
          perSecondVideo: 0.00049,
          outputTokensPer1M: 7.50,
          unit: 'USD',
          //notes: 'Video: $0.00049/sec, Output: $7.50/1M tokens'
        },
        toolConfig: {
          responseFormat: {
            jsonSchema: {
              name: 'video_analysis',
              schema: {
                type: 'object',
                properties: {
                  scenes: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        start_time: {
                          type: 'number',
                          description: 'Start time in seconds, rounded to 2 decimal places (e.g., 23.45)'
                        },
                        end_time: {
                          type: 'number',
                          description: 'End time in seconds, rounded to 2 decimal places (e.g., 27.89)'
                        },
                        description: {
                          type: 'string',
                          description: 'Description of what happens in this scene'
                        }
                      },
                      required: ['start_time', 'end_time', 'description']
                    }
                  }
                },
                required: ['scenes']
              }
            }
          }
        }
      },
      {
        displayName: 'Gemini 2.5 Flash',
        modelId: 'gemini-2.5-flash',
        api: '/model/start-video-understanding',
        apiType: 'gemini',
        enabled: true,
        maxDurationMinutes: 120,
        maxSizeGB: 2,
        pricing: {
          url: "https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash",
          inputTokensPer1M: 0.30, // text/image/video
          //inputTokensPer1MAudio: 1.00,
          outputTokensPer1M: 2.50,
          unit: 'USD',
          //notes: 'Input: $0.10/1M tokens (text/image/video), $0.70/1M (audio), Output: $0.40/1M tokens'
        },
        toolConfig: {
          responseSchema: {
            type: 'object',
            properties: {
              summary: {
                type: 'string',
                description: 'A high-level summary of the entire video content'
              },
              scenes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    start_time: {
                      type: 'number',
                      description: 'Start time in decimal seconds (e.g., 23.5 for 23.5 seconds)'
                    },
                    end_time: {
                      type: 'number',
                      description: 'End time in decimal seconds (e.g., 27.8 for 27.8 seconds)'
                    },
                    description: {
                      type: 'string',
                      description: 'Description of what happens in this scene'
                    }
                  },
                  required: ['start_time', 'end_time', 'description']
                }
              }
            },
            required: ['summary', 'scenes']
          }
        }
      },
      {
        displayName: 'Gemini 2.5 Pro',
        modelId: 'gemini-2.5-pro',
        api: '/model/start-video-understanding',
        apiType: 'gemini',
        enabled: true,
        maxDurationMinutes: 120,
        maxSizeGB: 2,
        pricing: {
          url: "https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-pro",
          inputTokensPer1M: 1.25, // text/image/video
          inputTokensPer1MAudio: 2.50,
          outputTokensPer1M: 15.00,
          unit: 'USD',
          //notes: 'Input: $0.50/1M tokens (text/image/video), $1.00/1M (audio), Output: $3.00/1M tokens'
        },
        toolConfig: {
          responseSchema: {
            type: 'object',
            properties: {
              summary: {
                type: 'string',
                description: 'A high-level summary of the entire video content'
              },
              scenes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    start_time: {
                      type: 'number',
                      description: 'Start time in decimal seconds (e.g., 23.5 for 23.5 seconds)'
                    },
                    end_time: {
                      type: 'number',
                      description: 'End time in decimal seconds (e.g., 27.8 for 27.8 seconds)'
                    },
                    description: {
                      type: 'string',
                      description: 'Description of what happens in this scene'
                    }
                  },
                  required: ['start_time', 'end_time', 'description']
                }
              }
            },
            required: ['summary', 'scenes']
          }
        }
      },
      {
        displayName: 'Gemini 3.1 Flash Lite Preview',
        modelId: 'gemini-3.1-flash-lite-preview',
        api: '/model/start-video-understanding',
        apiType: 'gemini',
        enabled: true,
        maxDurationMinutes: 120,
        maxSizeGB: 2,
        pricing: {
          url: "https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-flash-lite/#:~:text=Gemini%203.1%20Flash%2DLite%20is,and%20faster%20than%202.5%20Flash.",
          inputTokensPer1M: 0.25, // text/image/video
          //inputTokensPer1MAudio: 0.30,
          outputTokensPer1M: 1.50,
          unit: 'USD',
          //notes: 'Input: $0.10/1M tokens (text/image/video), $0.30/1M (audio), Output: $0.40/1M tokens'
        },
        toolConfig: {
          responseSchema: {
            type: 'object',
            properties: {
              summary: {
                type: 'string',
                description: 'A high-level summary of the entire video content'
              },
              scenes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    start_time: {
                      type: 'number',
                      description: 'Start time in decimal seconds (e.g., 23.5 for 23.5 seconds)'
                    },
                    end_time: {
                      type: 'number',
                      description: 'End time in decimal seconds (e.g., 27.8 for 27.8 seconds)'
                    },
                    description: {
                      type: 'string',
                      description: 'Description of what happens in this scene'
                    }
                  },
                  required: ['start_time', 'end_time', 'description']
                }
              }
            },
            required: ['summary', 'scenes']
          }
        }
      },
      {
        displayName: 'Gemini 3 Flash Preview',
        modelId: 'gemini-3-flash-preview',
        api: '/model/start-video-understanding',
        apiType: 'gemini',
        enabled: true,
        maxDurationMinutes: 120,
        maxSizeGB: 2,
        pricing: {
          url: "https://ai.google.dev/gemini-api/docs/pricing#gemini-3-flash-preview",
          inputTokensPer1M: 0.50, // text/image/video
          inputTokensPer1MAudio: 1.00,
          outputTokensPer1M: 3.00,
          unit: 'USD',
          //notes: 'Input: $0.25/1M tokens (text/image/video), $0.50/1M (audio), Output: $1.50/1M tokens'
        },
        toolConfig: {
          responseSchema: {
            type: 'object',
            properties: {
              summary: {
                type: 'string',
                description: 'A high-level summary of the entire video content'
              },
              scenes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    start_time: {
                      type: 'number',
                      description: 'Start time in decimal seconds (e.g., 23.5 for 23.5 seconds)'
                    },
                    end_time: {
                      type: 'number',
                      description: 'End time in decimal seconds (e.g., 27.8 for 27.8 seconds)'
                    },
                    description: {
                      type: 'string',
                      description: 'Description of what happens in this scene'
                    }
                  },
                  required: ['start_time', 'end_time', 'description']
                }
              }
            },
            required: ['summary', 'scenes']
          }
        }
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
