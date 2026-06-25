import fs from "fs";
import path from "path";
import {
  initializeParticipants,
  getParticipants,
  findParticipant,
  confirmWinner
} from "../src/participant-session.js";

const SESSION_DIR = "./sessions";
const PARTICIPANTS_FILE = path.join(
  SESSION_DIR,
  "participants.session.json"
);

describe("participant session", () => {
  beforeEach(() => {
    if (fs.existsSync(PARTICIPANTS_FILE)) {
      fs.unlinkSync(PARTICIPANTS_FILE);
    }

    if (fs.existsSync(SESSION_DIR)) {
      fs.rmSync(SESSION_DIR, {
        recursive: true,
        force: true
      });
    }
  });

  it("should initialize participants", () => {
    const participants = [
      {
        customerId: "C001",
        name: "John"
      }
    ];

    initializeParticipants(participants);

    expect(fs.existsSync(PARTICIPANTS_FILE))
      .toBe(true);

    const saved = JSON.parse(
      fs.readFileSync(
        PARTICIPANTS_FILE,
        "utf8"
      )
    );

    expect(saved).toEqual(participants);
  });

  it("should return participants", () => {
    const participants = [
      {
        customerId: "C001",
        name: "John"
      }
    ];

    initializeParticipants(participants);

    const result = getParticipants();

    expect(result).toEqual(participants);
  });

  it("should find participant by customerId", () => {
    initializeParticipants([
      {
        customerId: "C001",
        name: "John"
      },
      {
        customerId: "C002",
        name: "Jane"
      }
    ]);

    const participant =
      findParticipant("C002");

    expect(participant).toEqual({
      customerId: "C002",
      name: "Jane"
    });
  });

  it("should return undefined if participant not found", () => {
    initializeParticipants([
      {
        customerId: "C001"
      }
    ]);

    const participant =
      findParticipant("C999");

    expect(participant)
      .toBeUndefined();
  });

  it("should confirm winner and update participant", () => {
    initializeParticipants([
      {
        customerId: "C001",
        name: "John",
        winCount: 0
      }
    ]);

    const result = confirmWinner({
      customerId: "C001",
      prizeCode: "P01",
      prizeName: "iPhone"
    });

    expect(result.winCount)
      .toBe(1);

    expect(result.prizes)
      .toHaveLength(1);

    expect(result.prizes[0])
      .toEqual({
        prizeCode: "P01",
        prizeName: "iPhone"
      });

    expect(result.history)
      .toHaveLength(1);

    expect(result.history[0])
      .toMatchObject({
        prizeCode: "P01",
        prizeName: "iPhone",
        status: "confirmed"
      });
  });

  it("should return null if customer does not exist", () => {
    initializeParticipants([]);

    const result = confirmWinner({
      customerId: "NOT_FOUND",
      prizeCode: "P01",
      prizeName: "iPhone"
    });

    expect(result).toBeNull();
  });
});