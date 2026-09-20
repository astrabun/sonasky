import Layout from "../../../layouts/Dashboard";
import { Button } from "../../../components/ui/Button";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "../../../components/ui/Dialog";
import { Spinner } from "../../../components/ui/Spinner";
import { useCallback, useEffect, useState } from "react";
import { useAuthContext } from "../../../auth/auth-provider";
import { ASSET_COLLECTION_NS, GALLERY_COLLECTION_NS, PDS_COLLECTION_NS } from "../../../const";
import { getUriCollection } from "../../../helpers/resolveImageSource";

export function ManageData() {
  const { pdsAgent } = useAuthContext();
  const [open, setOpen] = useState(false);
  const [operationRunning, setOperationRunning] = useState(false);
  const [noDataDialogOpen, setNoDataDialogOpen] = useState(false);

  const [sonaRecords, setSonaRecords] = useState<any[]>([]);
  const loadSonaRecords = useCallback(async () => {
    const sonaRecords = await pdsAgent.com.atproto.repo.listRecords({
      collection: "app.sonasky.ref",
      repo: pdsAgent.accountDid,
    });
    setSonaRecords(sonaRecords.data.records);
  }, [pdsAgent]);
  useEffect(() => {
    void loadSonaRecords();
  }, [pdsAgent]);

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleNoDataDialogClose = () => {
    setNoDataDialogOpen(false);
  };

  const handleDelete = async () => {
    setOperationRunning(true);
    if (sonaRecords.length === 0) {
      setOperationRunning(false);
      setOpen(false);
      setNoDataDialogOpen(true);
    } else {
      for (const rec of sonaRecords) {
        await pdsAgent.com.atproto.repo.deleteRecord({
          collection: PDS_COLLECTION_NS,
          repo: pdsAgent.assertDid,
          rkey: rec.uri.split("/").pop() as string,
        });
      }
      const { data: galleryData } = await pdsAgent.com.atproto.repo.listRecords({
        collection: GALLERY_COLLECTION_NS,
        repo: pdsAgent.assertDid,
      });
      for (const rec of galleryData.records) {
        await pdsAgent.com.atproto.repo.deleteRecord({
          collection: GALLERY_COLLECTION_NS,
          repo: pdsAgent.assertDid,
          rkey: rec.uri.split("/").pop() as string,
        });
        const source = (rec.value as any).source as string;
        if (getUriCollection(source) === ASSET_COLLECTION_NS) {
          const [, , assetDid, , assetRkey] = source.split("/");
          if (assetDid === pdsAgent.assertDid) {
            await pdsAgent.com.atproto.repo.deleteRecord({
              collection: ASSET_COLLECTION_NS,
              repo: pdsAgent.assertDid,
              rkey: assetRkey,
            });
          }
        }
      }
      setTimeout(() => {
        location.reload(); // Reload page
      }, 1000);
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4">
        <h4 className="mb-2 text-2xl font-semibold">Manage Data</h4>
        {sonaRecords.length === 0 ? (
          <p className="mb-2">No SonaSky REF data found.</p>
        ) : (
          <Button variant="contained" color="error" onClick={handleClickOpen}>
            Clear SonaSky REF Data from Repo
          </Button>
        )}
        <Dialog open={open} onClose={handleClose}>
          <DialogTitle>Confirm Deletion</DialogTitle>
          <DialogContent>
            <DialogContentText>
              This is a non-reversible action that will delete all SonaSky REF data from your
              Bluesky account. Only use this if you are absolutely sure you'd like to delete your
              data. SonaSky does not keep any of your data - it all lives within your Bluesky
              account - so all this does is delete SonaSky REF data from your profile.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose} color="primary" disabled={operationRunning}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleDelete()}
              color="error"
              disabled={operationRunning}
              startIcon={operationRunning ? <Spinner size={20} /> : undefined}
            >
              {operationRunning ? "Deleting..." : "Delete Data"}
            </Button>
          </DialogActions>
        </Dialog>
        <Dialog open={noDataDialogOpen} onClose={handleNoDataDialogClose}>
          <DialogTitle>No Data Found</DialogTitle>
          <DialogContent>
            <DialogContentText>
              No SonaSky REF data was found in your Bluesky account to delete.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleNoDataDialogClose} color="primary">
              Close
            </Button>
          </DialogActions>
        </Dialog>
        <pre className="whitespace-pre-wrap break-words">
          {JSON.stringify(sonaRecords, undefined, 2)}
        </pre>
      </div>
    </Layout>
  );
}
