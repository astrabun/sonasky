interface DidService {
  id: string;
  type: string;
  serviceEndpoint: string;
}

interface DidDocument {
  service?: DidService[];
}

const resolveDidDocument = async (did: string): Promise<DidDocument> => {
  let url: string;
  if (did.startsWith("did:plc:")) {
    url = `https://plc.directory/${did}`;
  } else if (did.startsWith("did:web:")) {
    const host = did.slice("did:web:".length).replace(/:/g, "/");
    url = `https://${host}/.well-known/did.json`;
  } else {
    throw new Error(`Unsupported DID method for labeler "${did}"`);
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to resolve DID document for ${did}: ${res.status}`);
  }
  return (await res.json()) as DidDocument;
};

/**
 * Resolves the base HTTPS URL of a realm's Ozone labeler service.
 *
 * Uses the `{REALM}_LABELER_URL` env override when set, otherwise resolves the
 * `#atproto_labeler` service endpoint from `{REALM}_OZONE_SERVICE_USER_DID`'s
 * DID document.
 */
export async function resolveLabelerUrl(realm: string): Promise<string> {
  const prefix = realm.toUpperCase();

  const override = process.env[`${prefix}_LABELER_URL`];
  if (override) {
    return override.replace(/\/$/, "");
  }

  const did = process.env[`${prefix}_OZONE_SERVICE_USER_DID`];
  if (!did) {
    throw new Error(
      `Missing ${prefix}_OZONE_SERVICE_USER_DID (or ${prefix}_LABELER_URL) for realm "${realm}"`,
    );
  }

  const doc = await resolveDidDocument(did);
  const service = doc.service?.find(
    (s) => s.id === "#atproto_labeler" || s.type === "AtprotoLabeler",
  );
  if (!service) {
    throw new Error(`No #atproto_labeler service in DID document for ${did}`);
  }
  return service.serviceEndpoint.replace(/\/$/, "");
}
