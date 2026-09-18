interface PlcDirectoryResult {
  "@context": string[];
  id: string;
  alsoKnownAs: string[];
  verificationMethod: VerificationMethod[];
  service: Service[];
}

interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase: string;
}

interface Service {
  id: string;
  type: string;
  serviceEndpoint: string;
}

const findLabelerEndpoint = (data: PlcDirectoryResult): string | undefined =>
  data.service.find((s) => s.id === "#atproto_labeler" || s.type === "AtprotoLabeler")
    ?.serviceEndpoint;

export const getLabelerEndpoint = async (did: string): Promise<string | undefined> => {
  if (did.startsWith("did:web:")) {
    const hostname = did.slice("did:web:".length);
    try {
      const response = await fetch(`https://${hostname}/.well-known/did.json`);
      const data = (await response.json()) as PlcDirectoryResult;
      return findLabelerEndpoint(data);
    } catch {
      return undefined;
    }
  }

  try {
    const response = await fetch(`https://plc.directory/${did}`);
    const data = (await response.json()) as PlcDirectoryResult;
    return findLabelerEndpoint(data);
  } catch {
    return undefined;
  }
};
