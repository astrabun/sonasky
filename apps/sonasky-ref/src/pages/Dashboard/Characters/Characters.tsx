import React, { useCallback, useEffect, useState } from "react";
import { useAuthContext } from "../../../auth/auth-provider";
import { PDS_COLLECTION_NS } from "../../../const";
import Layout from "../../../layouts/Dashboard";
import { Button } from "../../../components/ui/Button";
import { Link } from "react-router";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

const ITEM_TYPE = "CHARACTER";

function DraggableCharacterItem({
  record,
  index,
  moveCharacter,
}: {
  record: any;
  index: number;
  moveCharacter: (dragIndex: number, hoverIndex: number) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  const [, drop] = useDrop({
    accept: ITEM_TYPE,
    hover(item: { index: number }) {
      if (!ref.current) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) {
        return;
      }
      moveCharacter(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag] = useDrag({
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    item: { index },
    type: ITEM_TYPE,
  });

  drag(drop(ref));

  return (
    <div ref={ref} className="cursor-grab" style={{ opacity: isDragging ? 0.5 : 1 }}>
      <Link
        to={`/dashboard/characters/edit/${record.uri.split("/").pop()}`}
        className="text-inherit no-underline"
      >
        <div className="mb-2 rounded-md border border-gray-300 p-3 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">
          <p className="font-medium">{record.value.character.name}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{record.uri.split("/").pop()}</p>
        </div>
      </Link>
    </div>
  );
}

function sortByDisplayIndex(records: any[]): any[] {
  return [...records].sort((a, b) => {
    const ai = a.value?.character?.displayIndex;
    const bi = b.value?.character?.displayIndex;
    if (ai === undefined && bi === undefined) {
      return 0;
    }
    if (ai === undefined) {
      return 1;
    }
    if (bi === undefined) {
      return -1;
    }
    return ai - bi;
  });
}

export function Characters() {
  const { pdsAgent } = useAuthContext();
  const [orderedRecords, setOrderedRecords] = useState<any[] | undefined>();
  const [saving, setSaving] = useState(false);
  const [orderModified, setOrderModified] = useState(false);

  const loadSonaRecords = useCallback(async () => {
    const result = await pdsAgent.com.atproto.repo.listRecords({
      collection: PDS_COLLECTION_NS,
      repo: pdsAgent.accountDid,
    });
    setOrderedRecords(sortByDisplayIndex(result.data.records));
  }, [pdsAgent]);

  useEffect(() => {
    void loadSonaRecords();
  }, [pdsAgent]);

  const moveCharacter = useCallback((dragIndex: number, hoverIndex: number) => {
    setOrderedRecords((prev) => {
      if (!prev) {
        return prev;
      }
      const updated = [...prev];
      const [dragged] = updated.splice(dragIndex, 1);
      updated.splice(hoverIndex, 0, dragged);
      return updated;
    });
    setOrderModified(true);
  }, []);

  const saveOrder = async () => {
    if (!orderedRecords) {
      return;
    }
    setSaving(true);
    try {
      await Promise.all(
        orderedRecords.map((record, index) => {
          const rkey = record.uri.split("/").pop();
          return pdsAgent.com.atproto.repo.putRecord({
            collection: PDS_COLLECTION_NS,
            record: {
              $type: PDS_COLLECTION_NS,
              character: {
                ...record.value.character,
                displayIndex: index,
              },
              createdAt: record.value.createdAt,
              modifiedAt: new Date().toISOString(),
            },
            repo: pdsAgent.assertDid,
            rkey,
            validate: false,
          });
        }),
      );
      setOrderModified(false);
    } catch (error) {
      console.error("Failed to save character order", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4">
        <h4 className="text-2xl font-semibold">Characters</h4>
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">(Drag to reorder)</p>
        {orderedRecords !== undefined && (
          <>
            {orderModified && (
              <Button variant="contained" onClick={saveOrder} disabled={saving} className="mb-4">
                {saving ? "Saving..." : "Save Order"}
              </Button>
            )}
            {orderedRecords.length === 0 && <p>No characters found</p>}
            <DndProvider backend={HTML5Backend}>
              {orderedRecords.map((record: any, idx: number) => (
                <DraggableCharacterItem
                  key={record.uri}
                  record={record}
                  index={idx}
                  moveCharacter={moveCharacter}
                />
              ))}
            </DndProvider>
          </>
        )}
      </div>
    </Layout>
  );
}
