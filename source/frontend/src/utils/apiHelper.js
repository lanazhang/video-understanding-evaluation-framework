import { fetchAuthSession } from 'aws-amplify/auth'
import { post, get, put, del } from 'aws-amplify/api'

async function FetchPost(path, reqbody = null, apiName = 'EvalService') {
  const request = await ConstructRequest(path, reqbody, apiName)
  const restOperation = await post(request)
  const { body } = await restOperation.response
  const data = await body.json()
  return data
}

async function FetchPut(path, reqbody = null, apiName = 'EvalService') {
  const request = await ConstructRequest(path, reqbody, apiName)
  const restOperation = await put(request)
  const { body } = await restOperation.response
  const data = await body.json()
  return data
}

async function FetchGet(path, reqbody = null, apiName = 'EvalService') {
  const request = await ConstructRequest(path, reqbody, apiName)
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

async function ConstructRequest(path, reqbody, apiName) {
  const session = await fetchAuthSession()
  const token = session.tokens?.idToken?.toString()
  
  // Remove leading slash from path if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path.slice(1) : path
  
  return {
    apiName: apiName,
    path: cleanPath,
    options: {
      body: reqbody,
      headers: {
        Authorization: token ? `Bearer ${token}` : undefined,
        'x-api-key': import.meta.env.VITE_APIGATEWAY_API_KEY
      },
      queryParams: null
    }
  }
}

export { FetchPost, FetchPut, FetchGet, FetchDelete }
