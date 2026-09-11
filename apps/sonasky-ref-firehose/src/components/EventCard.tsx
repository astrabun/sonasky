import { useEffect, useState } from "react";
import { getPostImages, getProfile } from "../cache";
import { EVENT_FADE_MS } from "../const";
import type { FirehoseEvent, PostImage, Profile } from "../types";

interface EventCardProps {
  event: FirehoseEvent;
  fading: boolean;
  nsfwVisible: boolean;
}

const OP_STYLE: Record<FirehoseEvent["operation"], string> = {
  create: "bg-green-600/20 text-green-400",
  delete: "bg-red-600/20 text-red-400",
  update: "bg-blue-600/20 text-blue-400",
};

function atUriToPostUrl(atUri: string): string {
  const parts = atUri.slice(5).split("/");
  const did = parts[0] ?? "";
  const rkey = parts[2] ?? "";
  return `https://bsky.app/profile/${did}/post/${rkey}`;
}

function bskyProfileUrl(handle: string | undefined, did: string): string {
  return `https://bsky.app/profile/${handle ?? did}`;
}

interface RefImageProps {
  image: PostImage;
  isNsfw: boolean;
  nsfwVisible: boolean;
  postUrl: string;
}

function RefImage({ image, isNsfw, nsfwVisible, postUrl }: RefImageProps) {
  return (
    <a href={postUrl} rel="noopener noreferrer" target="_blank">
      <div className="relative overflow-hidden rounded-lg">
        <img
          src={image.url}
          alt={image.alt}
          className={`max-h-52 object-contain transition-all duration-300 ${
            isNsfw && !nsfwVisible ? "blur-xl" : ""
          }`}
        />
        {isNsfw && !nsfwVisible && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="bg-black/70 text-white text-xs px-2.5 py-1 rounded-full">
              NSFW - toggle to reveal
            </span>
          </div>
        )}
        {isNsfw && nsfwVisible && (
          <span className="absolute top-2 left-2 bg-amber-500/80 text-white text-xs px-1.5 py-0.5 rounded font-medium">
            NSFW
          </span>
        )}
      </div>
    </a>
  );
}

export function EventCard({ event, fading, nsfwVisible }: EventCardProps) {
  const [profile, setProfile] = useState<Profile | undefined>();
  const [refImages, setRefImages] = useState<PostImage[]>([]);
  const [altImages, setAltImages] = useState<PostImage[]>([]);

  useEffect(() => {
    void getProfile(event.did).then(setProfile);
  }, [event.did]);

  useEffect(() => {
    if (!event.character?.refSheet) {
      return;
    }
    void getPostImages(event.character.refSheet).then(setRefImages);
  }, [event.character?.refSheet]);

  useEffect(() => {
    if (!event.character?.altRef) {
      return;
    }
    void getPostImages(event.character.altRef).then(setAltImages);
  }, [event.character?.altRef]);

  const char = event.character;
  const isNsfw = char?.nsfw === true;
  const refImage = refImages[char?.refSheetImageIndex ?? 0] ?? refImages[0];
  const altImage = altImages[char?.altRefImageIndex ?? 0] ?? altImages[0];

  const timestamp = new Date(event.timeUs / 1000).toLocaleTimeString();
  const displayName = profile?.displayName ?? profile?.handle ?? `${event.did.slice(0, 20)}…`;
  const handle = profile ? `@${profile.handle}` : undefined;
  const profileLink = bskyProfileUrl(profile?.handle, event.did);
  const recordLink = `https://ref.sonasky.app/profile/${profile?.handle ?? event.did}/${event.rkey}`;

  return (
    <div
      className={`bg-neutral-800 rounded-xl p-4 flex gap-3 transition-opacity ${fading ? "opacity-0" : "opacity-100"}`}
      style={{ transitionDuration: `${EVENT_FADE_MS}ms` }}
    >
      <div className="shrink-0">
        <a href={profileLink} rel="noopener noreferrer" target="_blank">
          {profile?.avatar ? (
            <img
              src={profile.avatar}
              alt={displayName}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-neutral-700" />
          )}
        </a>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={profileLink}
            rel="noopener noreferrer"
            target="_blank"
            className="font-semibold text-white truncate hover:underline"
          >
            {displayName}
          </a>
          {handle && (
            <a
              href={profileLink}
              rel="noopener noreferrer"
              target="_blank"
              className="text-neutral-400 text-sm truncate hover:underline"
            >
              {handle}
            </a>
          )}
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${OP_STYLE[event.operation]}`}
          >
            {event.operation}
          </span>
          <span className="text-neutral-500 text-xs ml-auto shrink-0">{timestamp}</span>
        </div>

        {char ? (
          <>
            <p className="text-neutral-200 mt-1">
              <a
                href={recordLink}
                rel="noopener noreferrer"
                target="_blank"
                className="font-medium hover:underline"
              >
                {char.name}
              </a>
              {char.species && <span className="text-neutral-400 text-sm"> · {char.species}</span>}
              {char.pronouns && (
                <span className="text-neutral-400 text-sm"> · {char.pronouns}</span>
              )}
              {isNsfw && nsfwVisible && !(refImage ?? altImage) && (
                <span className="ml-1.5 inline-flex items-center text-xs px-1.5 py-0.5 rounded font-medium bg-amber-500/20 text-amber-400">
                  NSFW
                </span>
              )}
            </p>
            {(refImage ?? altImage) && (
              <div className="mt-2 flex gap-2 flex-wrap">
                {refImage && char.refSheet && (
                  <RefImage
                    image={refImage}
                    isNsfw={isNsfw}
                    nsfwVisible={nsfwVisible}
                    postUrl={atUriToPostUrl(char.refSheet)}
                  />
                )}
                {altImage && char.altRef && (
                  <RefImage
                    image={altImage}
                    isNsfw={isNsfw}
                    nsfwVisible={nsfwVisible}
                    postUrl={atUriToPostUrl(char.altRef)}
                  />
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-neutral-500 text-sm mt-1 font-mono">{event.rkey}</p>
        )}
      </div>
    </div>
  );
}
