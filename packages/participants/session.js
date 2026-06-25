import fs from "fs";
import path from "path";

const SESSION_DIR =
  "./sessions";

const PARTICIPANTS_FILE =
  path.join(
    SESSION_DIR,
    "participants.session.json"
  );

/**
 * 1. LOGIC
 */

    /**
     * 1.1. Ensure session directory exists
     */
function ensureSessionDirectory() {

  if (
    !fs.existsSync(
      SESSION_DIR
    )
  ) {

    fs.mkdirSync(
      SESSION_DIR,
      {
        recursive: true
      }
    );

  }

}

    /**
     * 1.2. Save participants to session file
     */
function saveParticipants(
  participants
) {

  ensureSessionDirectory();

  fs.writeFileSync(

    PARTICIPANTS_FILE,

    JSON.stringify(
      participants,
      null,
      2
    )

  );

}

    /**
     * 1.3. Read participants from session file
     */
function readParticipants() {

  if (

    !fs.existsSync(
      PARTICIPANTS_FILE
    )

  ) {

    return [];

  }

  return JSON.parse(

    fs.readFileSync(
      PARTICIPANTS_FILE,
      "utf8"
    )

  );

}

/**
 * 2. PUBLIC API
 */
export function initializeParticipants(
  participants
) {

  saveParticipants(
    participants
  );

  return participants;

}

    /**
     * 2.1. Get participants from session
     */
export function getParticipants() {

  return readParticipants();

}

    /**
     * 2.2. Find participant by customerId
     */
export function findParticipant(
  customerId
) {

  const participants =
    readParticipants();

  return participants.find(

    participant =>

      participant.customerId ===
      customerId

  );

}

    /**
     * 2.3. Confirm winner for a participant
     */
export function confirmWinner({

  customerId,

  prizeCode,

  prizeName,

  status = "confirmed"

}) {

  const participants =
    readParticipants();

  const participant =
    participants.find(

      p =>

        p.customerId ===
        customerId

    );

  if (!participant) {

    return null;

  }

  /// Update participant's win count and prize history
  participant.winCount =
    (participant.winCount || 0)
    + 1;

  /// Update participant's prizes
  participant.prizes =
    participant.prizes || [];

  participant.prizes.push({

    prizeCode,

    prizeName

  });

  /// Update participant's history
  participant.history =
    participant.history || [];

  participant.history.push({

    timestamp:
      new Date()
        .toISOString(),

    prizeCode,

    prizeName,

    status

  });

  saveParticipants(
    participants
  );

  return participant;

}