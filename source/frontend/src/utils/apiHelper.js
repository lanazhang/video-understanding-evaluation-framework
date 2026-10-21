// Thin fetch client for the local backend (FastAPI, same routes as the former API Gateway).
// Base URL, e.g. http://localhost:8080/v1/ (see .env.example)
const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/v1/').replace(/\/?$/, '/')

class ApiError extends Error {
  constructor(message, status, body) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.response = body
  }
}

async function request(method, path, reqbody = null, queryParams = null) {
  // Remove leading slash and any query string (queryParams is the place for those)
  let cleanPath = path.startsWith('/') ? path.slice(1) : path
  const queryStringIndex = cleanPath.indexOf('?')
  if (queryStringIndex !== -1) {
    cleanPath = cleanPath.substring(0, queryStringIndex)
  }

  const url = new URL(cleanPath, API_BASE)
  Object.entries(queryParams || {}).forEach(([k, v]) => v != null && url.searchParams.set(k, v))

  const init = { method, headers: {} }
  if (reqbody != null && method !== 'GET') {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(reqbody)
  }

  const res = await fetch(url, init)
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    throw new ApiError(data?.error || data?.detail || `Request failed (${res.status})`, res.status, data)
  }
  return data
}

// `apiName` is kept for call-site compatibility (there was one API, 'EvalService').
async function FetchPost(path, reqbody = null, apiName = 'EvalService') {
  const data = await request('POST', path, reqbody)

  // Check if the response contains an error
  if (data?.statusCode && data.statusCode >= 400) {
    const errorBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
    const error = new Error(errorBody?.error || 'Request failed')
    error.response = data
    throw error
  }

  return data
}

async function FetchPut(path, reqbody = null, apiName = 'EvalService') {
  return request('PUT', path, reqbody)
}

async function FetchGet(path, reqbody = null, apiName = 'EvalService', queryParams = null) {
  return request('GET', path, null, queryParams)
}

async function FetchDelete(path, reqbody = null, apiName = 'EvalService') {
  return request('DELETE', path, reqbody)
}

export { FetchPost, FetchPut, FetchGet, FetchDelete, ApiError }
