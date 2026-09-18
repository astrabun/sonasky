import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react";
import { ChevronDown } from "lucide-react";
import { changelogData, latestVersion } from "../../../changelog";
import Layout from "../../../layouts/Dashboard";

function Changelog() {
  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4">
        <h4 className="mb-2 text-2xl font-semibold">SonaSky REF Changelog</h4>
        <h5 className="text-xl font-semibold">Current Version: {latestVersion.version}</h5>
        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
          {latestVersion.date.format(`YYYY-MM-DD`)}
        </p>
        <ul className="list-disc pl-5">
          {latestVersion.changes.map((change, index) => (
            <li key={index}>{change}</li>
          ))}
        </ul>
        {changelogData.length > 1 && <hr className="my-4 border-gray-300 dark:border-gray-700" />}
        {changelogData.length > 1 && (
          <h5 className="mb-2 text-xl font-semibold">Previous Versions</h5>
        )}
        {changelogData
          .filter((i) => i.version !== latestVersion.version)
          .sort((a, b) => b.date.valueOf() - a.date.valueOf())
          .map((version, index) => (
            <Disclosure
              key={index}
              as="div"
              className="border-b border-gray-200 dark:border-gray-700"
            >
              {({ open }) => (
                <>
                  <DisclosureButton className="flex w-full items-center justify-between py-3 text-left">
                    <span>
                      Version {version.version} - {version.date.format(`YYYY-MM-DD`)}
                    </span>
                    <ChevronDown
                      size={20}
                      className={`transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </DisclosureButton>
                  <DisclosurePanel className="pb-3">
                    <ul className="list-disc pl-5">
                      {version.changes.map((change, idx) => (
                        <li key={idx}>{change}</li>
                      ))}
                    </ul>
                  </DisclosurePanel>
                </>
              )}
            </Disclosure>
          ))}
      </div>
    </Layout>
  );
}

export default Changelog;
