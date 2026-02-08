import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { secureSet, secureGet, secureRemove } from "./storage";

const ACTIVE_KEY = "hordecraft_nickname";
const ACTIVE_PIN_KEY = "hordecraft_nickname_pin";

// Bad word filter (Turkish + English)
const BLOCKED_WORDS = [
  "fuck","shit","ass","bitch","dick","cock","pussy","slut","whore","nigger",
  "nigga","fag","faggot","retard","cunt","penis","vagina","rape","nazi",
  "porn","sex","cum","sik","yarrak","amina","amk","orospu","piç","göt",
  "sikim","sikik","siktir","anan","pezevenk","ibne","gavat","yarak","taşak",
  "meme","kaltak","kahpe","döl","bok","haysiyetsiz",
];

function normalizeLeetspeak(s: string): string {
  return s
    .toLowerCase()
    .replace(/4/g, "a")
    .replace(/3/g, "e")
    .replace(/1/g, "i")
    .replace(/0/g, "o")
    .replace(/5/g, "s")
    .replace(/[_\-.\s]/g, "");
}

function containsBlockedWord(name: string): boolean {
  const normalized = normalizeLeetspeak(name);
  return BLOCKED_WORDS.some(word => normalized.includes(word));
}

/** Normalize nickname for document ID */
function norm(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Check if a nickname is already claimed (Firestore) */
export async function isNicknameClaimed(nickname: string): Promise<boolean> {
  const ref = doc(db, "nicknames", norm(nickname));
  const snap = await getDoc(ref);
  return snap.exists();
}

/** Register a new nickname with a 4-digit PIN (Firestore). Returns error string or null. */
export async function registerNickname(nickname: string, pin: string): Promise<string | null> {
  const n = nickname.trim();
  if (n.length < 2 || n.length > 16) return "invalid_length";
  if (!/^\d{4}$/.test(pin)) return "invalid_pin";
  if (containsBlockedWord(n)) return "inappropriate_name";

  const id = norm(n);
  const ref = doc(db, "nicknames", id);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return "already_claimed";
  }

  await setDoc(ref, {
    nickname: n,
    pin,
    claimedAt: new Date().toISOString(),
  });

  secureSet(ACTIVE_KEY, n);
  secureSet(ACTIVE_PIN_KEY, pin);

  return null;
}

/** Login/claim an existing nickname with PIN (Firestore). Returns error string or null. */
export async function claimNickname(nickname: string, pin: string): Promise<string | null> {
  const n = nickname.trim();
  if (containsBlockedWord(n)) return "inappropriate_name";
  const id = norm(n);
  const ref = doc(db, "nicknames", id);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return "not_found";
  }

  const data = snap.data();
  if (data.pin !== pin) {
    return "wrong_pin";
  }

  secureSet(ACTIVE_KEY, data.nickname);
  secureSet(ACTIVE_PIN_KEY, pin);

  return null;
}

/** Get currently active nickname (local) */
export function getActiveNickname(): string {
  try {
    return secureGet(ACTIVE_KEY) || "";
  } catch {
    return "";
  }
}

/** Clear active nickname (logout) */
export function logoutNickname() {
  secureRemove(ACTIVE_KEY);
  secureRemove(ACTIVE_PIN_KEY);
}
