import './styles/main.css'

import seedsData from '../data/sites.json'
import statusData from '../data/status.json'
import { mergeSites } from './core/merge'
import type { SiteSeed, StatusFile } from './core/types'
import { mountApp } from './ui/render'

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('页面缺少 #app 挂载节点')

const statusFile = statusData as StatusFile
const sites = mergeSites(seedsData as SiteSeed[], statusFile)

mountApp(root, sites, statusFile.updatedAt)
