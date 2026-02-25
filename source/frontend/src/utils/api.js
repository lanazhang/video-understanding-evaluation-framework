import { FetchGet, FetchPost, FetchPut, FetchDelete } from './apiHelper'

// Evaluation Service API calls
export const evalAPI = {
  // Videos
  listVideos: async () => {
    try {
      return await FetchGet('/videos', null, 'EvalService')
    } catch (error) {
      console.error('Error fetching videos:', error)
      throw error
    }
  },

  uploadVideo: async (videoData) => {
    try {
      return await FetchPost('/videos', videoData, 'EvalService')
    } catch (error) {
      console.error('Error uploading video:', error)
      throw error
    }
  },

  deleteVideo: async (videoId) => {
    try {
      return await FetchDelete(`/videos/${videoId}`, null, 'EvalService')
    } catch (error) {
      console.error('Error deleting video:', error)
      throw error
    }
  },

  getPresignedUrl: async (videoId, operation = 'getObject') => {
    try {
      return await FetchGet(`/videos/${videoId}/presigned-url`, null, 'EvalService', { operation })
    } catch (error) {
      console.error('Error getting presigned URL:', error)
      throw error
    }
  },

  // Multipart upload management
  manageS3PresignedUrl: async (payload) => {
    try {
      return await FetchPost('/videos/manage-s3-presigned-url', payload, 'EvalService')
    } catch (error) {
      console.error('Error managing S3 presigned URL:', error)
      throw error
    }
  },

  // Ground Truth Tasks
  listGroundTruthTasks: async () => {
    try {
      return await FetchGet('/ground-truth/tasks', null, 'EvalService')
    } catch (error) {
      console.error('Error fetching ground truth tasks:', error)
      throw error
    }
  },

  createGroundTruthTask: async (taskData) => {
    try {
      return await FetchPost('/ground-truth/tasks', taskData, 'EvalService')
    } catch (error) {
      console.error('Error creating ground truth task:', error)
      throw error
    }
  },

  getGroundTruthTask: async (taskId) => {
    try {
      return await FetchGet(`/ground-truth/tasks/${taskId}`, null, 'EvalService')
    } catch (error) {
      console.error('Error fetching ground truth task:', error)
      throw error
    }
  },

  // Evaluation Tasks
  listEvaluationTasks: async () => {
    try {
      return await FetchGet('/evaluation/tasks', null, 'EvalService')
    } catch (error) {
      console.error('Error fetching evaluation tasks:', error)
      throw error
    }
  },

  createEvaluationTask: async (taskData) => {
    try {
      return await FetchPost('/evaluation/tasks', taskData, 'EvalService')
    } catch (error) {
      console.error('Error creating evaluation task:', error)
      throw error
    }
  },

  getEvaluationTask: async (taskId) => {
    try {
      return await FetchGet(`/evaluation/tasks/${taskId}`, null, 'EvalService')
    } catch (error) {
      console.error('Error fetching evaluation task:', error)
      throw error
    }
  },

  // Analyze Tasks
  getAnalyzeTasks: async (videoId, type = null) => {
    try {
      const payload = { VideoId: videoId }
      if (type) payload.Type = type
      return await FetchPost('/video/get-analyze-tasks', payload, 'EvalService')
    } catch (error) {
      console.error('Error fetching analyze tasks:', error)
      throw error
    }
  },

  startNovaMme: async (payload) => {
    try {
      return await FetchPost('/video/start-nova-mme', payload, 'EvalService')
    } catch (error) {
      console.error('Error starting Nova MME:', error)
      throw error
    }
  },

  // Vector Search
  searchVectorEmbeddings: async (payload) => {
    try {
      return await FetchPost('/video/nova-mme-search-vector', payload, 'EvalService')
    } catch (error) {
      console.error('Error searching vector embeddings:', error)
      throw error
    }
  },

  searchTlabsVectorEmbeddings: async (payload) => {
    try {
      return await FetchPost('/video/tlabs-mme-search-vector', payload, 'EvalService')
    } catch (error) {
      console.error('Error searching TwelveLabs vector embeddings:', error)
      throw error
    }
  },

  // Ground Truth
  upsertGroundTruth: async (payload) => {
    try {
      return await FetchPost('/video/upsert-ground-truth', payload, 'EvalService')
    } catch (error) {
      console.error('Error upserting ground truth:', error)
      throw error
    }
  },

  getGroundTruths: async (videoId = null, createdBy = null) => {
    try {
      const payload = {}
      if (videoId) payload.VideoId = videoId
      if (createdBy) payload.CreatedBy = createdBy
      return await FetchPost('/video/get-ground-truths', payload, 'EvalService')
    } catch (error) {
      console.error('Error fetching ground truths:', error)
      throw error
    }
  },

  deleteGroundTruth: async (groundTruthId) => {
    try {
      return await FetchPost('/video/delete-ground-truth', { Id: groundTruthId }, 'EvalService')
    } catch (error) {
      console.error('Error deleting ground truth:', error)
      throw error
    }
  },

  // Evaluation Tasks
  upsertEvaluationTask: async (payload) => {
    try {
      return await FetchPost('/eval/upsert-evaluation-task', payload, 'EvalService')
    } catch (error) {
      console.error('Error upserting evaluation task:', error)
      throw error
    }
  },

  getEvaluationTasks: async (videoId = null, groundTruthId = null, createdBy = null) => {
    try {
      const payload = {}
      if (videoId) payload.VideoId = videoId
      if (groundTruthId) payload.GroundTruthId = groundTruthId
      if (createdBy) payload.CreatedBy = createdBy
      return await FetchPost('/eval/get-evaluation-tasks', payload, 'EvalService')
    } catch (error) {
      console.error('Error fetching evaluation tasks:', error)
      throw error
    }
  },

  deleteEvaluationTask: async (evaluationTaskId) => {
    try {
      return await FetchPost('/eval/delete-evaluation-task', { Id: evaluationTaskId }, 'EvalService')
    } catch (error) {
      console.error('Error deleting evaluation task:', error)
      throw error
    }
  }
}

