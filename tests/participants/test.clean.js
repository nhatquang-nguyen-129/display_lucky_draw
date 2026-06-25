import {
  describe,
  it,
  expect
} from "vitest";

import {
  cleanParticipants
} from "../../packages/participants/clean.js";

describe(
  "participants/clean.js",
  () => {

    /**
     * -----------------------------------------
     * Normalize Name
     * -----------------------------------------
     */
    it(
      "should normalize fullName to Title Case",
      () => {

        const result =
          cleanParticipants([
            {
              fullName:
                "   NGUYEN    VAN    A   ",
              phone:
                "0901234567"
            }
          ]);

        expect(
          result[0].fullName
        ).toBe(
          "Nguyen Van A"
        );

      }
    );

    /**
     * -----------------------------------------
     * Normalize Phone +84
     * -----------------------------------------
     */
    it(
      "should normalize +84 phone",
      () => {

        const result =
          cleanParticipants([
            {
              fullName:
                "A",

              phone:
                "+84901234567"
            }
          ]);

        expect(
          result[0].phone
        ).toBe(
          "0901234567"
        );

      }
    );

    /**
     * -----------------------------------------
     * Normalize Phone 84
     * -----------------------------------------
     */
    it(
      "should normalize 84 phone",
      () => {

        const result =
          cleanParticipants([
            {
              fullName:
                "A",

              phone:
                "84901234567"
            }
          ]);

        expect(
          result[0].phone
        ).toBe(
          "0901234567"
        );

      }
    );

    /**
     * -----------------------------------------
     * Add leading 0
     * -----------------------------------------
     */
    it(
      "should add leading zero for 9 digit phone",
      () => {

        const result =
          cleanParticipants([
            {
              fullName:
                "A",

              phone:
                "901234567"
            }
          ]);

        expect(
          result[0].phone
        ).toBe(
          "0901234567"
        );

      }
    );

    /**
     * -----------------------------------------
     * Generate customerId
     * -----------------------------------------
     */
    it(
      "should generate customerId",
      () => {

        const result =
          cleanParticipants([
            {
              fullName:
                "A",

              phone:
                "0901234567"
            }
          ]);

        expect(
          result[0]
            .customerId
        ).toBeDefined();

        expect(
          typeof result[0]
            .customerId
        ).toBe(
          "string"
        );

      }
    );

    /**
     * -----------------------------------------
     * Keep existing customerId
     * -----------------------------------------
     */
    it(
      "should keep existing customerId",
      () => {

        const result =
          cleanParticipants([
            {
              customerId:
                "CUS001",

              fullName:
                "A",

              phone:
                "0901234567"
            }
          ]);

        expect(
          result[0]
            .customerId
        ).toBe(
          "CUS001"
        );

      }
    );

    /**
     * -----------------------------------------
     * Remove duplicate phones
     * -----------------------------------------
     */
    it(
      "should remove duplicate phones",
      () => {

        const result =
          cleanParticipants([

            {
              fullName:
                "A",

              phone:
                "0901234567"
            },

            {
              fullName:
                "B",

              phone:
                "0901234567"
            }

          ]);

        expect(
          result.length
        ).toBe(
          1
        );

      }
    );

    /**
     * -----------------------------------------
     * Remove empty phone
     * -----------------------------------------
     */
    it(
      "should remove records without phone",
      () => {

        const result =
          cleanParticipants([

            {
              fullName:
                "A",

              phone:
                ""
            }

          ]);

        expect(
          result.length
        ).toBe(
          0
        );

      }
    );

    /**
     * -----------------------------------------
     * Keep original fields
     * -----------------------------------------
     */
    it(
      "should keep all original fields",
      () => {

        const result =
          cleanParticipants([
            {
              fullName:
                "A",

              phone:
                "0901234567",

              province:
                "Ha Noi",

              source:
                "Google Form"
            }
          ]);

        expect(
          result[0]
            .province
        ).toBe(
          "Ha Noi"
        );

        expect(
          result[0]
            .source
        ).toBe(
          "Google Form"
        );

      }
    );

  }
);