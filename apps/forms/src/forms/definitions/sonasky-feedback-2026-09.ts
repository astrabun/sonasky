import type { FormDefinition } from "../types.ts";
import { SUBMIT } from "../types.ts";

/**
 * 2026-09 SonaSky Feedback Survey.
 *
 * Google Form: supplied via the `GFORM_FEEDBACK_2026_09` env var. `entry.*` ids
 * + option text are from the form's "Get pre-filled link" URL - select `value`s
 * must match the Google option text verbatim.
 *
 * The Google Form must be a SINGLE PAGE (no section breaks) - this app owns the
 * section flow and branching, and a flat `entry.*` POST only works against a
 * single-page form. The branching lives here as per-section `routing`:
 *   labels_intro (Q4): Yes/Maybe -> digimon, No -> handle
 *   digimon (Q5):      Yes -> low_use, No -> handle
 *   low_use (Q6):      -> handle
 *   handle (Q8):       Yes -> extra, No -> submit
 */

// Q6 - "Name (users)". All present because someone once requested them.
const LOW_USE_LABELS = [
  "Tayra (0)",
  "Potoroo (0)",
  "Pooka (0)",
  "Toad (0)",
  "Geroo (0)",
  "Camel (0)",
  "Capercaillie (0)",
  "Couatl (0)",
  "Prairie Dog (0)",
  "Sand Fox (0)",
  "Muscovy Duck (1)",
  "Housefly (1)",
  "Slipfin (1)",
  "Orangutan (1)",
  "Lupe (1)",
  "Dovekie (1)",
  "Salmonid (1)",
  "Zora (1)",
  "Allosaurus (1)",
  "Bangaa (1)",
  "Mewlin (1)",
  "Boxer (1)",
  "Turaco (1)",
  "Gila Monster (1)",
  "Canterwit (1)",
  "Egyptian Cobra (1)",
  "Inkblot Toon (1)",
  "Malagasy Giant Rat (1)",
  "Droukkits (1)",
  "Popori (1)",
  "Carolina Dog (1)",
  "Kremling (1)",
  "Tak (1)",
  "Nightbeast (1)",
  "Draksune (1)",
  "Aardvark (1)",
  "Lunborn (1)",
  "Sea Horse (1)",
  "Bulgae (1)",
  "Peakit (1)",
  "Microchimera (1)",
  "Ringed Plover (1)",
  "Biyomon (1)",
  "Cetacean (1)",
  "Chimpanzee (1)",
  "Fey'ri (1)",
  "Kodkod (1)",
  "Magpie Duck (1)",
  "Manx Cat (1)",
  "Moki (1)",
  "Persian Fallow Deer (1)",
  "Pteromon (1)",
  "Thylacoleo (1)",
  "Quox (2)",
  "African Crested Porcupine (2)",
  "Langurhali (2)",
  "Blue Marlin (2)",
  "Heeler (2)",
  "Red Heeler (2)",
  "Hyacinth Macaw (2)",
  "Cacomistle (2)",
  "Boa Constrictor (2)",
  "Stingray (2)",
  "Ixi (2)",
  "Caitian (2)",
  "Skiltaire (2)",
  "Albatross (2)",
  "Mystian (2)",
  "Great Pyrenees (2)",
  "Rikkor (2)",
  "Swedish Vallhund (2)",
  "Amphiptere (2)",
  "Marmot (2)",
  "Dik-Dik (2)",
  "Azhdarchid (2)",
  "Ceratosaurus (2)",
  "Herbivore (2)",
  "Skunkbear (2)",
  "Anomalocaris (2)",
  "Karelian Bear Dog (2)",
  "Swampling (2)",
  "Angoramon (2)",
  "King Shepherd (2)",
  "Gemsbok (2)",
  "Bateleur Eagle (2)",
  "Mystimew (2)",
  "Kyrinith (2)",
  "Halonyx (2)",
  "Starrcat (2)",
  "Gaomon (2)",
  "Beezle (2)",
  "Armadillomon (2)",
  "Sea Angel (2)",
  "Jex (2)",
  "Puffin (2)",
  "Australian Magpie (2)",
  "BetelGammamon (2)",
  "Canary (2)",
  "Lobster (2)",
  "Ryukyu Robin (2)",
  "Sparrow (2)",
  "Stickbug (2)",
  "Thai Bangkaew Dog (2)",
  "White Swiss Shepherd (2)",
  "Kudu (3)",
  "Dracat (3)",
  "Coral Reef (3)",
  "Teshari (3)",
  "Tibetan Fox (3)",
  "Bohemian Shepherd (3)",
  "Bandicoot (3)",
  "Bori (3)",
  "Xweetok (3)",
  "Cape Fox (3)",
  "Quaker Parrot (3)",
  "Pronghorn (3)",
  "Dramster (3)",
  "Kangaroo Rat (3)",
  "Balinese (3)",
  "Swaria (3)",
  "Halsanju/Fecto (3)",
  "Dimetrodon (3)",
  "Gerbil (3)",
  "Asiatic Cheetah (3)",
  "Sendaen (3)",
  "Crocodile Skink (3)",
  "Hogzilla (3)",
  "Cozumel Raccoon (3)",
  "Troll (Folklore) (3)",
  "Scottish Fold Munchkin (3)",
  "Leopard Cat (3)",
  "Siberian Cat (3)",
  "Boston Terrier (3)",
  "Alexander Archipelago Wolf (3)",
  "Bengal Cat (3)",
  "Culpeo (3)",
  "Loon (3)",
  "Mazzikin (3)",
  "Sodaroo (3)",
  "California Quail (3)",
  "Chow Chow (3)",
  "Fishing Cat (3)",
  "Cormorant (3)",
  "Quokka (3)",
  "House Sparrow (3)",
  "Sturgeon (3)",
  "White Shepherd (3)",
  "Kan'vi (4)",
  "Swan (4)",
  "Robin (4)",
  "Lionbear (4)",
  "Mammoth (4)",
  "Kingfisher (4)",
  "Greyhound (4)",
  "Aisha (4)",
  "Dryad (4)",
  "Chipori (4)",
  "Pudu (4)",
  "Displacer Beast (4)",
  "Valravn (4)",
  "Burmecian (4)",
  "Ender Dragon (4)",
  "Scrub Jay (4)",
  "Finnish Spitz (4)",
  "Tegu (4)",
  "Caiman (4)",
  "Ankylosaurus (4)",
  "Aftik (4)",
  "Great Dane (4)",
  "Caprid (4)",
  "Arctic Hare (4)",
  "Chinese Crested Dog (4)",
  "Compsognathus (4)",
  "Manatee (4)",
  "Scimitar-Toothed Cat (4)",
  "Weevil (4)",
  "Iberian Wolf (4)",
  "Diamond Dog (4)",
  "Coeurl (4)",
  "Gazelle (4)",
  "Jack Russel Terrier (4)",
  "Shikoku Inu (5)",
  "Porcupine (5)",
  "Flamingo (5)",
  "Zafara (5)",
  "Soundbyte (5)",
  "Cockatiel (5)",
  "Cornerian (5)",
  "Swift Fox (5)",
  "Potoo (5)",
  "Asura (5)",
  "Amphibian (5)",
  "Schnauzer (5)",
  "Papillon (Dog) (5)",
  "Bull Terrier (5)",
  "Impim (5)",
  "Carnotaurus (5)",
  "Tufted Deer (5)",
  "Hippopotamus (5)",
  "Scorpion (5)",
] as const;

const opt = (value: string) => ({ value, label: value });

export const feedbackSurvey202609: FormDefinition = {
  id: "sonasky-feedback-2026-09",
  title: "2026-09 - SonaSky Feedback Survey",
  description:
    "This is a short survey asking for your feedback on SonaSky. There are a couple of required " +
    "questions and some optional ones you'll be able to skip. The whole survey shouldn't take more " +
    "than 5 minutes to complete. Thank you very much for filling out the feedback form.",
  active: true,
  singleResponsePerUser: true,
  sections: [
    {
      id: "intro",
      fields: [
        {
          id: "uses",
          type: "multi-select",
          label: "Do you currently use SonaSky?",
          help: "Check all that apply.",
          required: true,
          options: [
            opt("Yes, SonaSky Labels"),
            opt("Yes, SonaSky Pokémon Labels"),
            opt("Yes, SonaSky Ref (Ref Sheet stored in your Bluesky Account)"),
            opt("Yes, SonaSky Feeds (new)"),
            opt("No, I don't use any of these"),
          ],
        },
        {
          id: "knew_ref",
          type: "single-select",
          label:
            "Did you know that if SonaSky doesn't offer a species label that you want, that you " +
            "can still use whatever species name you want on a SonaSky ref sheet?",
          help:
            "I know not every species is available as a label. But this is what drove the initial " +
            "development of SonaSky ref - a place for you to put as much detail as you want on your " +
            "character!",
          required: true,
          options: [
            opt("Yes, I did know that!"),
            opt("No, I didn't know that!"),
            opt("I don't use SonaSky ref"),
          ],
        },
        {
          id: "satisfaction",
          type: "linear-scale",
          label: "How satisfied are you with SonaSky, overall?",
          required: true,
          min: 1,
          max: 5,
          minLabel: "Very Dissatisfied",
          maxLabel: "Very Satisfied",
        },
      ],
    },
    {
      id: "labels_intro",
      title: "SonaSky's Least/Un-used Species Labels",
      description:
        "In the past, there was a submission form for requesting species labels be created when a " +
        "desired label did not yet exist.\n\n" +
        "Problem: In September 2024, SonaSky hit the maximum payload size Bluesky accepts for a " +
        "single labeler. This problem persisted even after splitting Pokémon labels on to their " +
        "own labeler.\n\n" +
        "While I want to be able to please everyone and have every possible label as an option, " +
        "the platform does not afford me this choice. So I have to get creative with workarounds " +
        "(like making the Pokémon labeler instance separate to free up slots, and removing pt-BR " +
        "translations to save space, at the risk of making the labeler less inclusive).\n\n" +
        "I've opened an issue in Bluesky's GitHub about this back in 2024, and it has not been " +
        "acknowledged by anyone yet as an issue they are working on. So for now, it seems we are " +
        "stuck with limits.\n\n" +
        "I want to propose a few things here - if I see there is enough interest in removing " +
        "low-use label definitions, I will. I know this has the potential to make a few people " +
        "unhappy. But I need to hear it from others that this is fully supported by the active " +
        "user base. Additionally, I want to know if folks have the tolerance for subscribing to " +
        "yet another (third) labeler.",
      fields: [
        {
          id: "remove_low_use",
          type: "single-select",
          label:
            "Are you on board with labels that see low use (0-5 users) being removed from SonaSky " +
            "in order to make room for new labels?",
          help:
            "New labels would need to have enough interest (at least 5 people, by this definition) " +
            "to warrant replacing an old label.",
          required: true,
          options: [opt("Yes"), opt("No"), opt("Maybe")],
        },
      ],
      routing: {
        fieldId: "remove_low_use",
        cases: { Yes: "digimon", Maybe: "digimon", No: "handle" },
        default: "handle",
      },
    },
    {
      id: "digimon",
      fields: [
        {
          id: "another_labeler",
          type: "single-select",
          label:
            "Would you be willing to subscribe to yet another labeler (on top of SonaSky and " +
            "SonaSky Pokémon) to split out Digimon species into their own labeler?",
          help:
            "Bluesky allows users to subscribe to a MAXIMUM of 20 labelers - if you subscribe to " +
            "that many already, you may run into an issue following yet another labeler. Example " +
            "error message: https://i.imgur.com/YGUCkqH.png",
          required: true,
          options: [opt("Yes"), opt("No")],
        },
      ],
      routing: {
        fieldId: "another_labeler",
        cases: { Yes: "low_use", No: "handle" },
        default: "handle",
      },
    },
    {
      id: "low_use",
      title: "Low Use Labels",
      description: "Please select labels you think should be eliminated from SonaSky, if any.",
      fields: [
        {
          id: "low_use_removals",
          type: "multi-select",
          label: "Low Use Labels You Think Should Be Removed",
          help:
            "Presented with the label and the number of users who have that label. All of these " +
            "labels are here because someone asked for them. Check all that apply.",
          required: true,
          options: LOW_USE_LABELS.map((v) => opt(v)),
        },
      ],
      // no routing => next section in document order ("handle")
    },
    {
      id: "handle",
      title: "Almost there!",
      fields: [
        {
          id: "bluesky_id",
          type: "text",
          label: "What is your Bluesky handle?",
          help: "Filled in automatically from your Bluesky account (your DID).",
          prefill: "did",
          maxLength: 256,
        },
        {
          id: "extra_questions",
          type: "single-select",
          label: "Would you be willing to answer 1-2 additional questions?",
          help:
            'It\'s one yes/no question, and one optional "additional comments" space for you to ' +
            "put whatever text you want in.",
          required: true,
          options: [opt("Yes"), opt("No")],
        },
      ],
      routing: {
        fieldId: "extra_questions",
        cases: { Yes: "extra", No: SUBMIT },
        default: SUBMIT,
      },
    },
    {
      id: "extra",
      title: "Additional Comments",
      description:
        "Thank you for opting to provide additional feedback! Please feel free to provide any " +
        "thoughts here.",
      fields: [
        {
          id: "breeds_on_species",
          type: "single-select",
          label: 'Do you think "breeds" should be on a "species" labeler?',
          help:
            'e.g., "Husky", "German Shepherd", "* Terrier" are all "breeds" of the species "dog".' +
            '\n\nThis question asks "should we have distinct labels for each breed" (yes) or if ' +
            'we should consolidate so all breeds are represented by a single "species" (no).',
          required: true,
          options: [opt("Yes"), opt("No")],
        },
        {
          id: "additional_comments",
          type: "longtext",
          label: "Additional Comments",
          required: true,
          maxLength: 10000,
        },
      ],
      // last section => submit
    },
  ],
  destinations: [
    {
      kind: "google-form",
      formIdEnvVar: "GFORM_FEEDBACK_2026_09",
      mapping: {
        perQuestion: {
          uses: "entry.343435218",
          knew_ref: "entry.44884737",
          satisfaction: "entry.1859914532",
          remove_low_use: "entry.1219997110",
          another_labeler: "entry.862446243",
          low_use_removals: "entry.1582760110",
          bluesky_id: "entry.1770450153",
          extra_questions: "entry.432144241",
          breeds_on_species: "entry.2039300953",
          additional_comments: "entry.1171084892",
        },
      },
      submissionUriEntryId: "entry.1724035961",
    },
  ],
};
