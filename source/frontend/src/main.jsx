import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { Amplify } from 'aws-amplify'

// Amplify configuration
let awsconfig = {
  "aws_project_region": import.meta.env.VITE_COGNITO_REGION || "us-east-1",
  "aws_cognito_identity_pool_id": import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID,
  "aws_cognito_region": import.meta.env.VITE_COGNITO_REGION || "us-east-1",
  "aws_user_pools_id": import.meta.env.VITE_COGNITO_USER_POOL_ID,
  "aws_user_pools_web_client_id": import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID,
  "oauth": {},
  "aws_cognito_username_attributes": [],
  "aws_cognito_social_providers": [],
  "aws_cognito_signup_attributes": ["EMAIL"],
  "aws_cognito_mfa_configuration": "OFF",
  "aws_cognito_mfa_types": ["SMS"],
  "aws_cognito_password_protection_settings": {
    "passwordPolicyMinLength": 8,
    "passwordPolicyCharacters": []
  },
  "aws_cognito_verification_mechanisms": ["EMAIL"]
}

Amplify.configure(awsconfig)

// Configure API endpoints
const existingConfig = Amplify.getConfig()
Amplify.configure({
  ...existingConfig,
  API: {
    ...existingConfig.API,
    REST: {
      ...existingConfig.API?.REST,
      EvalService: {
        endpoint: import.meta.env.VITE_APIGATEWAY_BASE_URL_EVAL_SRV,
        region: import.meta.env.VITE_COGNITO_REGION || "us-east-1"
      }
    }
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
