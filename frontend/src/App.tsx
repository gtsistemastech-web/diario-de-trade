import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import TodayPage from './pages/TodayPage'
import TradesPage from './pages/TradesPage'
import JournalPage from './pages/JournalPage'
import StatsPage from './pages/StatsPage'
import AnalysisPage from './pages/AnalysisPage'
import SettingsPage from './pages/SettingsPage'
import StrategiesPage from './pages/StrategiesPage'
import PlanPage from './pages/PlanPage'
import RiskPage from './pages/RiskPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<TodayPage />} />
        <Route path="/trades" element={<TradesPage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="/journal" element={<JournalPage />} />
        <Route path="/strategies" element={<StrategiesPage />} />
        <Route path="/risk" element={<RiskPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="*" element={<TodayPage />} />
      </Route>
    </Routes>
  )
}
