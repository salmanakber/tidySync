import { AppProvider } from "./providers";
import { Dashboard } from "./components/Dashboard";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <AppProvider>
      <Dashboard />
    </AppProvider>
  );
}
