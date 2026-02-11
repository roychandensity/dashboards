import { CUSTOMER_NAME } from "@/config/spaces";
import Dashboard from "@/components/Dashboard";
import { logout } from "@/app/login/actions";
import { fetchSpaces, fetchSensorHealth } from "@/lib/density-api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [allSpaces, sensorHealth] = await Promise.all([
    fetchSpaces(),
    fetchSensorHealth(),
  ]);

  const spaces = allSpaces.filter((s) => s.doorways.length > 0);

  const doorwayHealthMap: Record<string, string> = {};
  for (const sensor of sensorHealth) {
    if (sensor.doorway_id) {
      doorwayHealthMap[sensor.doorway_id] = sensor.health_status;
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {CUSTOMER_NAME}
          </h1>
          <p className="text-sm text-gray-500">
            Select a space to view occupancy data
          </p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-300 rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </form>
      </header>

      <Dashboard spaces={spaces} doorwayHealth={doorwayHealthMap} />
    </div>
  );
}
