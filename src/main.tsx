import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Experience } from './components/Experience'
const root = createRoot(document.getElementById('root')!)
root.render(<StrictMode><Experience /></StrictMode>)
