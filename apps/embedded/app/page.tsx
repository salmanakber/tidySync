import { AppProvider } from "./providers";
import { Dashboard } from "./components/Dashboard";

export default function HomePage() {
  return (
    <AppProvider>
      <Dashboard />
    </AppProvider>
  );
}
