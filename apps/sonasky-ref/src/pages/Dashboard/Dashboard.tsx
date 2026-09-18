import Layout from "../../layouts/Dashboard";

function Dashboard() {
  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4">
        <h4 className="mb-2 text-2xl font-semibold">Dashboard</h4>
        <p className="mb-2">Welcome to the Dashboard!</p>
        <p className="mb-2">
          This is where you will manage your characters and data. Use the navigation on the left to
          get started.
        </p>
      </div>
    </Layout>
  );
}

export default Dashboard;
