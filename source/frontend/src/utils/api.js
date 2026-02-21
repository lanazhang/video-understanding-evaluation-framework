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
      return await FetchGet(`/videos/${videoId}/presigned-url?operation=${operation}`, null, 'EvalService')
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
  }
}

