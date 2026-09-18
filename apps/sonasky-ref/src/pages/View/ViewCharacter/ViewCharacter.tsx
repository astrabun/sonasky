import { useCallback, useEffect, useState } from "react";
import { MarkdownDescription } from "../../../components/MarkdownDescription";
import { useNavigate, useParams } from "react-router";
import Layout from "../../../layouts/View";
import { Button } from "../../../components/ui/Button";
import { Chip } from "../../../components/ui/Chip";
import { FormControlLabel } from "../../../components/ui/Checkbox";
import { Menu, MenuItem } from "../../../components/ui/Menu";
import { Switch } from "../../../components/ui/Switch";
import { Tooltip } from "../../../components/ui/Tooltip";
import { Client, CredentialManager } from "@atcute/client";
import type {} from "@atcute/atproto";
import type { ActorIdentifier } from "@atcute/lexicons";
import { HANDLE_RESOLVER_URL } from "../../../const";
import {
  type CharacterLink,
  LINK_TYPE_LABELS,
  validateCharacterLink,
} from "../../../types/characterLinks";
import NotFound from "../../NotFound";
import { ArrowLeft, ChevronDown, ExternalLink } from "lucide-react";
import {
  exportAco,
  exportCss,
  exportGpl,
  exportKpl,
  exportTxt,
} from "../../../helpers/colorExport";
import { contrastColor } from "../../../helpers/contrastColor";
import { getPds } from "../../../helpers/getPds";

function Item({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div
      className={`rounded-md bg-white p-2 text-center text-sm text-gray-600 shadow dark:bg-gray-800 dark:text-gray-300 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

export function ViewCharacter() {
  const manager = new CredentialManager({ service: HANDLE_RESOLVER_URL });
  const [rpc, setRpc] = useState<Client>(new Client({ handler: manager }));
  const { blueskyHandleOrDID, rkey } = useParams<{
    blueskyHandleOrDID: string;
    rkey: string;
  }>();
  const navigate = useNavigate();
  const [character, setCharacter] = useState<any>();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [pdsResolved, setPdsResolved] = useState<boolean>(
    !blueskyHandleOrDID?.startsWith("did:web:"),
  );
  const [loadingText, setLoadingText] = useState<string>("Loading.");
  const transitionTime = 2000;
  const [refSheetImage, setRefSheetImage] = useState<string>("");
  const [altText, setAltText] = useState<string>("Ref Sheet");
  const [altRefSheetImage, setAltRefSheetImage] = useState<string>("");
  const [altAltText, setAltAltText] = useState<string>("Alt Ref Sheet");
  const [showAltRef, setShowAltRef] = useState<boolean>(false);

  const [copyColorClicked, setCopyColorClicked] = useState<boolean>(false);
  const [nsfwBlurred, setNsfwBlurred] = useState<boolean>(false);
  const [nsfwFadingOut, setNsfwFadingOut] = useState<boolean>(false);

  const handleGetPds = async () => {
    if (blueskyHandleOrDID) {
      const pds = await getPds(blueskyHandleOrDID);
      if (HANDLE_RESOLVER_URL !== pds && pds) {
        const newRpc = new Client({
          handler: new CredentialManager({ service: pds }),
        });
        setRpc(newRpc);
      }
      setPdsResolved(true);
    }
  };

  useEffect(() => {
    void handleGetPds();
  }, [blueskyHandleOrDID]);

  const resolvePostImages = useCallback(
    async (atUri: string): Promise<{ cid: string; did: string; alt: string }[]> => {
      const [, , did, , postRkey] = atUri.split("/");
      const { data } = await rpc.get("com.atproto.repo.getRecord", {
        params: {
          collection: "app.bsky.feed.post",
          repo: did as ActorIdentifier,
          rkey: postRkey,
        },
      });
      const { value } = data as any;
      const { embed } = value;
      if (embed?.$type === "app.bsky.embed.images" && embed.images) {
        return embed.images.map((img: any) => ({
          alt: img.alt ?? "",
          cid: img.image.ref.$link,
          did,
        }));
      }
      if (embed?.$type === "app.bsky.embed.record" && embed.record?.uri) {
        return resolvePostImages(embed.record.uri);
      }
      if (embed?.$type === "app.bsky.embed.recordWithMedia") {
        const ownImages: { alt: string; cid: string; did: string }[] = embed.media?.images
          ? embed.media.images.map((img: any) => ({
              alt: img.alt ?? "",
              cid: img.image.ref.$link,
              did,
            }))
          : [];
        const quotedImages = embed.record?.record?.uri
          ? await resolvePostImages(embed.record.record.uri)
          : [];
        return [...ownImages, ...quotedImages];
      }
      return [];
    },
    [rpc],
  );

  const loadCharacter = useCallback(async () => {
    try {
      const sonaRecords = await rpc.get("com.atproto.repo.listRecords", {
        params: {
          collection: "app.sonasky.ref",
          repo: (blueskyHandleOrDID ?? "") as ActorIdentifier,
        },
      });
      const record = (sonaRecords.data as any).records.find(
        (rec: any) => rec.uri.split("/").pop() === rkey,
      );
      if (record) {
        setCharacter((record.value as any).character);
      } else {
        setError(true);
      }
    } catch (error) {
      console.error("Failed to load character", error);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [blueskyHandleOrDID, rkey, rpc]);

  useEffect(() => {
    if (pdsResolved) {
      void loadCharacter();
    }
  }, [loadCharacter, pdsResolved]);

  useEffect(() => {
    if (!character) {
      return;
    }

    const loadImages = async () => {
      if (character.refSheet?.startsWith("at://")) {
        try {
          const images = await resolvePostImages(character.refSheet);
          const imageIndex = character.refSheetImageIndex ?? 0;
          const img = images[imageIndex] ?? images[0];
          if (img) {
            setAltText(images[imageIndex]?.alt || images[0]?.alt || "Ref Sheet");
            setRefSheetImage(
              `https://cdn.bsky.app/img/feed_fullsize/plain/${img.did}/${img.cid}@jpeg`,
            );
          }
        } catch {
          // Silently skip if post is inaccessible
        }
      }
      if (character.altRef?.startsWith("at://")) {
        try {
          const images = await resolvePostImages(character.altRef);
          const imageIndex = character.altRefImageIndex ?? 0;
          const img = images[imageIndex] ?? images[0];
          if (img) {
            setAltAltText(images[imageIndex]?.alt || images[0]?.alt || "Alt Ref Sheet");
            setAltRefSheetImage(
              `https://cdn.bsky.app/img/feed_fullsize/plain/${img.did}/${img.cid}@jpeg`,
            );
          }
        } catch {
          // Silently skip if post is inaccessible
        }
      }
      setError(false);
    };

    void loadImages();
  }, [character, resolvePostImages]);

  useEffect(() => {
    if (!character?.nsfw) {
      return;
    }
    const key = `nsfw-confirm:${globalThis.location.pathname}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      const ts = parseInt(stored, 10);
      if (Date.now() - ts < 30 * 24 * 60 * 60 * 1000) {
        return;
      }
    }
    setNsfwBlurred(true);
  }, [character]);

  const handleNsfwConfirm = () => {
    localStorage.setItem(`nsfw-confirm:${globalThis.location.pathname}`, Date.now().toString());
    setNsfwFadingOut(true);
  };

  const handleNsfwGoBack = () => {
    if (globalThis.history.length > 1) {
      void navigate(-1);
    } else {
      void navigate("/");
    }
  };

  useEffect(() => {
    if (loading) {
      const interval = setInterval(() => {
        setLoadingText((prev) => {
          if (prev === "Loading...") {
            return "Loading.";
          }
          if (prev === "Loading..") {
            return "Loading...";
          }
          return "Loading..";
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [loading]);

  if (loading) {
    return (
      <Layout>
        <div style={{ marginTop: "2rem" }} />
        <div className="mx-auto max-w-6xl px-4">
          <p className="mb-2">{loadingText}</p>
        </div>
      </Layout>
    );
  }

  if (error || !character) {
    return <NotFound />;
  }

  const getBlueskyLink = (atUri: string): string => {
    const [, , did, , rkey] = atUri.split("/");
    return `https://bsky.app/profile/${did}/post/${rkey}`;
  };

  const validLinks = (character.links ?? []).filter(validateCharacterLink);

  return (
    <Layout>
      <div style={{ marginTop: "2rem" }} />
      <div className="mx-auto max-w-6xl px-4">
        <Button
          startIcon={<ArrowLeft size={18} />}
          onClick={() => navigate(`/profile/${blueskyHandleOrDID}`)}
          className="mb-4"
        >
          Back
        </Button>
        <Button
          startIcon={<ExternalLink size={18} />}
          onClick={() =>
            window.open(
              `https://bsky.app/profile/${blueskyHandleOrDID}`,
              "_blank",
              "noopener,noreferrer",
            )
          }
          className="mb-4 ml-4"
        >
          View Bluesky Profile
        </Button>
        <div
          className="transition-opacity"
          style={{ opacity: loading ? 0 : 1, transitionDuration: `${transitionTime}ms` }}
        >
          <div className="flex flex-col items-center">
            <p className="text-3xl">{character.name}</p>
            <p className="text-xl">Species: {character.species}</p>
            {character.pronouns && <p className="text-lg">{character.pronouns}</p>}
            <div className="flex flex-row flex-wrap justify-center gap-2">
              {/* If nsfw is okay, display chip */}
              {character.nsfw && <Chip color="warning" label="NSFW" />}
              {/* If draw without asking, display chip */}
              {character.drawWithoutAskingSFW && (
                <Chip color="info" label="OK to draw SFW without asking" />
              )}
              {character.doNotDrawWithoutAskingSFW && (
                <Chip color="default" label="Please ask before drawing SFW" />
              )}
              {character.drawWithoutAskingNSFW && (
                <Chip color="error" label="OK to draw NSFW without asking" />
              )}
              {character.doNotDrawWithoutAskingNSFW && (
                <Chip color="default" label="Please ask before drawing NSFW" />
              )}
            </div>
          </div>
          {character.description && <MarkdownDescription content={character.description} />}
          {/* Colors Grid */}
          <div className="mb-4 mt-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
              {character.colors.map((color: any, idx: any) => {
                const defaultChipLabel = `Click to copy ${color.label} (#${color.hex})`;
                const handleCopyClick = () => {
                  setCopyColorClicked(true);
                };
                const handleMouseLeave = () => {
                  setCopyColorClicked(false);
                };
                return (
                  <Item key={`color-${idx}`} className="h-full">
                    <Tooltip title={copyColorClicked ? "Copied!" : defaultChipLabel}>
                      <button
                        type="button"
                        id={color.hex}
                        className="flex h-full w-full flex-col items-start justify-start rounded-md p-4 text-left"
                        style={{
                          backgroundColor: `#${color.hex}`,
                          color: contrastColor(color.hex),
                        }}
                        onClick={() => {
                          void navigator.clipboard.writeText(`#${color.hex}`);
                          handleCopyClick();
                        }}
                        onMouseLeave={handleMouseLeave}
                      >
                        <span>{color.label}</span>
                        <span>#{color.hex}</span>
                      </button>
                    </Tooltip>
                  </Item>
                );
              })}
            </div>
            {character.colors?.length > 0 && (
              <div className="mt-3 flex justify-center">
                <Menu
                  trigger={
                    <Button variant="outlined" endIcon={<ChevronDown size={18} />}>
                      Export Colors
                    </Button>
                  }
                >
                  <MenuItem onClick={() => exportGpl(character.colors, character.name)}>
                    GIMP Palette (.gpl)
                  </MenuItem>
                  <MenuItem onClick={() => exportKpl(character.colors, character.name)}>
                    Krita Palette (.kpl)
                  </MenuItem>
                  <MenuItem onClick={() => exportCss(character.colors, character.name)}>
                    CSS Variables (.css)
                  </MenuItem>
                  <MenuItem onClick={() => exportAco(character.colors, character.name)}>
                    Adobe Color (and CSP) (.aco)
                  </MenuItem>
                  <MenuItem onClick={() => exportTxt(character.colors, character.name)}>
                    Plain Text (.txt)
                  </MenuItem>
                </Menu>
              </div>
            )}
          </div>
          {/* Links */}
          {validLinks.length > 0 && (
            <div className="mb-4 mt-4 flex flex-wrap gap-2">
              {validLinks.map((link: CharacterLink, idx: number) => (
                <Button
                  key={idx}
                  variant="outlined"
                  size="small"
                  onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
                  startIcon={<ExternalLink size={16} />}
                >
                  {link.label || LINK_TYPE_LABELS[link.type]}
                </Button>
              ))}
            </div>
          )}
          {/* Ref Sheet */}
          {character.altRef && (
            <FormControlLabel
              control={
                <Switch
                  checked={showAltRef}
                  onChange={() => setShowAltRef(!showAltRef)}
                  name="showAltRef"
                />
              }
              label="Toggle Alt Ref"
            />
          )}
          {!showAltRef && refSheetImage && (
            <div className="mb-4">
              <p className="text-xl">Ref Sheet</p>
              <img
                src={`${refSheetImage}`}
                alt={altText}
                className="max-w-full cursor-pointer"
                onClick={() => window.open(getBlueskyLink(character.refSheet), "_blank")}
              />
              {character.refSheetCredit && (
                <p className="text-xs">Credit: {character.refSheetCredit}</p>
              )}
            </div>
          )}
          {showAltRef && altRefSheetImage && (
            <div className="mb-4">
              <p className="text-xl">Alt Ref Sheet</p>
              <img
                src={`${altRefSheetImage}`}
                alt={altAltText}
                className="max-w-full cursor-pointer"
                onClick={() => window.open(getBlueskyLink(character.altRef), "_blank")}
              />
              {character.altRefCredit && (
                <p className="text-xs">Credit: {character.altRefCredit}</p>
              )}
            </div>
          )}
        </div>
      </div>
      {nsfwBlurred && (
        <div
          onTransitionEnd={() => {
            if (nsfwFadingOut) {
              setNsfwBlurred(false);
            }
          }}
          className="fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-500"
          style={{
            backdropFilter: "blur(50px)",
            backgroundColor: "rgba(0,0,0,0.6)",
            opacity: nsfwFadingOut ? 0 : 1,
          }}
        >
          <div className="mx-2 flex max-w-[420px] flex-col gap-4 rounded-lg bg-white p-8 text-center shadow-xl dark:bg-gray-900">
            <p className="text-xl">NSFW Content</p>
            <p>
              This character is marked as NSFW. You must be 18 years of age or older to view this
              content.
            </p>
            <div className="flex justify-center gap-4">
              <Button variant="contained" color="primary" onClick={handleNsfwConfirm}>
                I'm 18+ | Continue
              </Button>
              <Button variant="outlined" onClick={handleNsfwGoBack}>
                Go Back
              </Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
