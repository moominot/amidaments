import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { DriveConfigProvider } from './context/DriveConfigContext.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <DriveConfigProvider>
            <App />
        </DriveConfigProvider>
    </React.StrictMode>,
)
