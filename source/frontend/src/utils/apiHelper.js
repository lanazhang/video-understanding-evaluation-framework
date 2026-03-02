import { fetchAuthSession } from 'aws-amplify/auth'
import { post, get, put, del } from 'aws-amplify/api'

async function FetchPost(path, reqbody = null, apiName = 'EvalService') {
  const request = await ConstructRequest(path, reqbody, apiName)
  const restOperation = await post(request)
  const { body } = await restOperation.response
  const data = await body.json()
  
  // Check if the response contains an error
  if (data.statusCode && data.statusCode >= 400) {
    const errorBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
    const error = new Error(errorBody?.error || 'Request failed')
    error.response = data
    throw error
  }
  
  return data
}

async function FetchPut(path, reqbody = null, apiName = 'EvalService') {
  const request = await ConstructRequest(path, reqbody, apiName)
  const restOperation = await put(request)
  const { body } = await restOperation.response
  const data = await body.json()
  return data
}

async function FetchGet(path, reqbody = null, apiName = 'EvalService', queryParams = null) {
  const request = await ConstructRequest(path, reqbody, apiName, queryParams)
  const restOperation = await get(request)
  const { body } = await restOperation.response
  const data = await body.json()
  return data
}

async function FetchDelete(path, reqbody = null, apiName = 'EvalService') {
  const request = await ConstructRequest(path, reqbody, apiName)
  const restOperation = await del(request)
  const { body } = await restOperation.response
  const data = await body.json()
  return data
}

async function ConstructRequest(path, reqbody, apiName, queryParams = null) {
  const session = await fetchAuthSession()
  const token = session.tokens?.idToken?.toString()
  
  // Remove leading slash from path if present to avoid double slashes
  // Also remove query string from path if present (should be in queryParams instead)
  let cleanPath = path.startsWith('/') ? path.slice(1) : path
  const queryStringIndex = cleanPath.indexOf('?')
  if (queryStringIndex !== -1) {
    cleanPath = cleanPath.substring(0, queryStringIndex)
  }
  
  return {
    apiName: apiName,
    path: cleanPath,
    options: {
      body: reqbody,
      headers: {
        Authorization: token ? `Bearer ${token}` : undefined,
        'x-api-key': import.meta.env.VITE_APIGATEWAY_API_KEY
      },
      queryParams: queryParams
    }
  }
}

export { FetchPost, FetchPut, FetchGet, FetchDelete }
