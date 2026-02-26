import React from 'react'
import './Introduction.css'
import { modelGroups } from '../../static/modelConfig'

function Introduction() {
  return (
    <div className="introduction-container">
      <div className="introduction-content">
        <h1>Welcome to Video Understanding Evaluation</h1>
        
        <div className="intro-section">
          <h2>Business Goal</h2>
          <p className="intro-description">
            This platform enables comprehensive evaluation of multimodal AI models on video understanding tasks, 
            serving two key personas with distinct needs:
          </p>
          
          <div className="personas-grid">
            <div className="persona-card">
              <h3>
                <svg className="persona-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#f97316" strokeWidth="2"/>
                  <path d="M12 8V12L15 15" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="12" r="2" fill="#f97316"/>
                </svg>
                Business Decision Makers
              </h3>
              <p>
                Customers who need to evaluate video AI solutions against their specific use cases—such as sports event 
                analysis, IP camera labeling, or retail monitoring. Starting with a small set of videos and very specific 
                requirements, they need to quickly evaluate multiple models and solutions to make informed decisions about 
                which technology best fits their needs.
              </p>
              <div className="persona-benefits">
                <strong>Key Benefits:</strong>
                <ul>
                  <li>Rapid model comparison for quick decision-making</li>
                  <li>Use-case specific evaluation with custom videos</li>
                  <li>Clear metrics to justify technology investments</li>
                </ul>
              </div>
            </div>
            
            <div className="persona-card">
              <h3>
                <svg className="persona-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 3H4C3.44772 3 3 3.44772 3 4V9C3 9.55228 3.44772 10 4 10H9C9.55228 10 10 9.55228 10 9V4C10 3.44772 9.55228 3 9 3Z" stroke="#10b981" strokeWidth="2"/>
                  <path d="M20 3H15C14.4477 3 14 3.44772 14 4V9C14 9.55228 14.4477 10 15 10H20C20.5523 10 21 9.55228 21 9V4C21 3.44772 20.5523 3 20 3Z" stroke="#10b981" strokeWidth="2"/>
                  <path d="M9 14H4C3.44772 14 3 14.4477 3 15V20C3 20.5523 3.44772 21 4 21H9C9.55228 21 10 20.5523 10 20V15C10 14.4477 9.55228 14 9 14Z" stroke="#10b981" strokeWidth="2"/>
                  <path d="M20 14H15C14.4477 14 14 14.4477 14 15V20C14 20.5523 14.4477 21 15 21H20C20.5523 21 21 20.5523 21 20V15C21 14.4477 20.5523 14 20 14Z" stroke="#10b981" strokeWidth="2"/>
                  <circle cx="6.5" cy="6.5" r="1.5" fill="#10b981"/>
                  <circle cx="17.5" cy="6.5" r="1.5" fill="#10b981"/>
                  <circle cx="6.5" cy="17.5" r="1.5" fill="#10b981"/>
                  <circle cx="17.5" cy="17.5" r="1.5" fill="#10b981"/>
                </svg>
                Data Scientists & Researchers
              </h3>
              <p>
                Technical professionals who need a robust tool to perform efficient, scientific evaluation against 
                industry-specific datasets. They require systematic approaches to benchmark models, create high-quality 
                ground truth data, and generate reproducible evaluation results for research or production deployment.
              </p>
              <div className="persona-benefits">
                <strong>Key Benefits:</strong>
                <ul>
                  <li>Scientific evaluation with detailed metrics</li>
                  <li>Efficient ground truth creation workflow</li>
                  <li>Comprehensive model benchmarking capabilities</li>
                </ul>
              </div>
            </div>
          </div>
          
          <p className="intro-description">
            The platform provides features to serve both personas: analyze videos using various models and pipelines, 
            create ground truth datasets through a hybrid approach combining AI-assisted labeling with human validation, 
            and evaluate model performance with detailed metrics and comparisons.
          </p>
        </div>

        <div className="workflow-diagram">
          <h2>How It Works</h2>
          <svg viewBox="0 0 800 450" xmlns="http://www.w3.org/2000/svg" className="diagram-svg">
            {/* Step 1: Upload Videos */}
            <g className="step-group">
              <rect x="20" y="50" width="140" height="80" rx="8" fill="#FFFFFF" stroke="#f97316" strokeWidth="2"/>
              <text x="90" y="85" textAnchor="middle" fill="#212529" fontSize="14" fontWeight="bold">1. Upload Videos</text>
              <text x="90" y="105" textAnchor="middle" fill="#6c757d" fontSize="12">Upload video files</text>
              <text x="90" y="120" textAnchor="middle" fill="#6c757d" fontSize="12">to S3 storage</text>
            </g>

            {/* Arrow 1 */}
            <path d="M 160 90 L 200 90" stroke="#f97316" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)"/>

            {/* Step 2: Analyze */}
            <g className="step-group">
              <rect x="200" y="50" width="140" height="80" rx="8" fill="#FFFFFF" stroke="#f97316" strokeWidth="2"/>
              <text x="270" y="80" textAnchor="middle" fill="#212529" fontSize="14" fontWeight="bold">2. Analyze</text>
              <text x="270" y="98" textAnchor="middle" fill="#6c757d" fontSize="11">Run multiple models</text>
              <text x="270" y="112" textAnchor="middle" fill="#6c757d" fontSize="11">and pipelines</text>
              <text x="270" y="126" textAnchor="middle" fill="#6c757d" fontSize="11">for comparison</text>
            </g>

            {/* Arrow 2 */}
            <path d="M 340 90 L 380 90" stroke="#f97316" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)"/>

            {/* Step 3: Ground Truth */}
            <g className="step-group">
              <rect x="380" y="50" width="140" height="80" rx="8" fill="#FFFFFF" stroke="#f97316" strokeWidth="2"/>
              <text x="450" y="80" textAnchor="middle" fill="#212529" fontSize="14" fontWeight="bold">3. Ground Truth</text>
              <text x="450" y="98" textAnchor="middle" fill="#6c757d" fontSize="11">AI-assisted +</text>
              <text x="450" y="112" textAnchor="middle" fill="#6c757d" fontSize="11">human labeling</text>
              <text x="450" y="126" textAnchor="middle" fill="#6c757d" fontSize="11">for efficiency</text>
            </g>

            {/* Arrow 3 */}
            <path d="M 520 90 L 560 90" stroke="#f97316" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)"/>

            {/* Step 4: Evaluate */}
            <g className="step-group">
              <rect x="560" y="50" width="140" height="80" rx="8" fill="#FFFFFF" stroke="#f97316" strokeWidth="2"/>
              <text x="630" y="85" textAnchor="middle" fill="#212529" fontSize="14" fontWeight="bold">4. Evaluate</text>
              <text x="630" y="105" textAnchor="middle" fill="#6c757d" fontSize="12">Compare models</text>
              <text x="630" y="120" textAnchor="middle" fill="#6c757d" fontSize="12">and metrics</text>
            </g>

            {/* Model Categories */}
            <g className="model-categories">
              <rect x="20" y="180" width="320" height="220" rx="8" fill="#f8f9fa" stroke="#10b981" strokeWidth="2"/>
              <text x="180" y="205" textAnchor="middle" fill="#212529" fontSize="14" fontWeight="bold">Supported Model Categories</text>
              
              <text x="40" y="235" fill="#10b981" fontSize="12" fontWeight="bold">• Multimodal Embedding</text>
              <text x="55" y="255" fill="#6c757d" fontSize="11">Nova MME, TwelveLabs Marengo</text>
              
              <text x="40" y="280" fill="#10b981" fontSize="12" fontWeight="bold">• Video Understanding</text>
              <text x="55" y="300" fill="#6c757d" fontSize="11">Nova Lite/Pro, TwelveLabs, Gemini</text>
              
              <text x="40" y="325" fill="#10b981" fontSize="12" fontWeight="bold">• Image Frame Based</text>
              <text x="55" y="345" fill="#6c757d" fontSize="11">Nova, Llama, OpenAI, Gemini</text>
              
              <text x="40" y="370" fill="#10b981" fontSize="12" fontWeight="bold">• Video Clip Based</text>
              <text x="55" y="390" fill="#6c757d" fontSize="11">Nova Lite/Pro pipelines</text>
            </g>

            {/* Features */}
            <g className="features-group">
              <rect x="380" y="180" width="320" height="220" rx="8" fill="#f8f9fa" stroke="#f97316" strokeWidth="2"/>
              <text x="540" y="205" textAnchor="middle" fill="#212529" fontSize="14" fontWeight="bold">Key Features</text>
              
              <text x="400" y="235" fill="#495057" fontSize="12">• Multi-Model Analysis: Compare approaches</text>
              <text x="400" y="260" fill="#495057" fontSize="12">• Hybrid Labeling: AI + human validation</text>
              <text x="400" y="285" fill="#495057" fontSize="12">• Embedding Search: Find similar moments</text>
              <text x="400" y="310" fill="#495057" fontSize="12">• Side-by-Side Comparison: Visual analysis</text>
              <text x="400" y="335" fill="#495057" fontSize="12">• Metrics: Precision, Recall, F1 Score</text>
              <text x="400" y="360" fill="#495057" fontSize="12">• Export: Download evaluation reports</text>
              <text x="400" y="385" fill="#495057" fontSize="12">• Efficient Workflow: Rapid evaluation</text>
            </g>

            {/* Arrow definitions */}
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                <polygon points="0 0, 10 3, 0 6" fill="#f97316" />
              </marker>
            </defs>
          </svg>
        </div>

        <div className="getting-started">
          <h2>Getting Started</h2>
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">1</div>
              <h3>Upload Videos</h3>
              <p>Navigate to the Videos tab and upload your video files. The system supports various video formats and automatically stores them in S3 for processing.</p>
            </div>

            <div className="step-card">
              <div className="step-number">2</div>
              <h3>Analyze with Multiple Models</h3>
              <p>Select a video and run analysis using different model categories: multimodal embeddings, video understanding models, frame-based pipelines, or clip-based approaches. Compare results to find the best fit for your use case.</p>
            </div>

            <div className="step-card">
              <div className="step-number">3</div>
              <h3>Create Ground Truth Efficiently</h3>
              <p>Use AI-assisted labeling by leveraging model results as a starting point, then refine with human validation. Combine embedding search with manual labeling to create high-quality reference datasets quickly.</p>
            </div>

            <div className="step-card">
              <div className="step-number">4</div>
              <h3>Evaluate and Compare</h3>
              <p>Create evaluation tasks to measure model performance against your ground truth. View detailed metrics, compare multiple models side-by-side, and export comprehensive reports for analysis.</p>
            </div>
          </div>
        </div>

        <div className="model-overview">
          <h2>Available Models and Pipelines</h2>
          <div className="model-groups-grid">
            {modelGroups.map((group, idx) => (
              <div key={idx} className="model-group-card">
                <h3>{group.groupName}</h3>
                <ul className="model-list">
                  {group.models.map((model, midx) => (
                    <li key={midx}>{model.displayName}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="tips-section">
          <h2>Tips for Best Results</h2>
          <ul className="tips-list">
            <li>
              <strong>Multi-Model Strategy:</strong> Run multiple models and pipelines on the same video to compare their strengths and identify the best approach for your specific use case.
            </li>
            <li>
              <strong>Hybrid Ground Truth:</strong> Start with AI-generated results from embedding search or model outputs, then refine with human validation to create accurate ground truth efficiently.
            </li>
            <li>
              <strong>Pipeline Selection:</strong> Choose between video understanding (full video context), frame-based (detailed per-frame analysis), or clip-based (segment analysis) depending on your requirements.
            </li>
            <li>
              <strong>Embedding Dimensions:</strong> For multimodal embeddings, experiment with different dimension sizes to balance between accuracy and performance.
            </li>
            <li>
              <strong>Iterative Evaluation:</strong> Use evaluation metrics to continuously improve your ground truth datasets and refine model selection for optimal results.
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default Introduction
