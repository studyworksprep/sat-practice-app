-- Reviewed content tags, not a schema migration.
-- Source: content/technique-tagging/2026-10-10.json.
-- Re-runnable: duplicate pairs are left untouched, including attribution.
-- Guards reject changed question rows or technique definitions.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $tagging$
declare
  reviewed jsonb := $questions$[
  {
    "question_id": "eb38912b-1ac4-41b2-9fb5-2bec3c011722",
    "technique_id": "c17f093e-c470-44bb-a5ac-8da617814b58",
    "display_code": "M-00083",
    "row_md5": "eaca7e3223af8e582dd8d166b2424d78"
  },
  {
    "question_id": "d4ac330e-d0f1-4139-aa59-7ff3af59a404",
    "technique_id": "c17f093e-c470-44bb-a5ac-8da617814b58",
    "display_code": "M-00123",
    "row_md5": "5be2d003a1086dc48db12c8c34ea2519"
  },
  {
    "question_id": "19975f4b-c590-45c5-b942-95ff41278b9a",
    "technique_id": "c17f093e-c470-44bb-a5ac-8da617814b58",
    "display_code": "M-00170",
    "row_md5": "bf56d19f473167848cd8594b61375728"
  },
  {
    "question_id": "d7c734db-7371-4bc3-bf03-237d51dd614f",
    "technique_id": "c17f093e-c470-44bb-a5ac-8da617814b58",
    "display_code": "M-00432",
    "row_md5": "c29504c5d329d8bac80472f5b7e9ea2b"
  },
  {
    "question_id": "73b5c33b-fcfe-4a1d-b677-52b8d025ff5d",
    "technique_id": "c17f093e-c470-44bb-a5ac-8da617814b58",
    "display_code": "M-00508",
    "row_md5": "c77da0b6a8ee7029364111a1ffbea6da"
  },
  {
    "question_id": "54705557-5b43-48dd-a0c8-ff3a53840f68",
    "technique_id": "c17f093e-c470-44bb-a5ac-8da617814b58",
    "display_code": "M-00568",
    "row_md5": "9ab83ecb532f89a57932474ae9a14e0e"
  },
  {
    "question_id": "413be83c-a24b-47c2-a112-efd4dfbc7aa1",
    "technique_id": "c17f093e-c470-44bb-a5ac-8da617814b58",
    "display_code": "M-00609",
    "row_md5": "553def51a02eaa572d199be0e3c86fd2"
  },
  {
    "question_id": "1cd22c60-697e-4c6e-82bd-a0c1ab802ef0",
    "technique_id": "c17f093e-c470-44bb-a5ac-8da617814b58",
    "display_code": "M-00800",
    "row_md5": "bd3cfdf6650d559f4e12ce27c59ffb5d"
  },
  {
    "question_id": "ad09b3af-49f0-4d74-8622-871670966782",
    "technique_id": "c17f093e-c470-44bb-a5ac-8da617814b58",
    "display_code": "M-00845",
    "row_md5": "4955add66dee88192e898bed8a840a5b"
  },
  {
    "question_id": "bc6f4b35-2d43-493d-a7b4-13da85e13495",
    "technique_id": "c17f093e-c470-44bb-a5ac-8da617814b58",
    "display_code": "M-00848",
    "row_md5": "af41950924cd9ea69aade5c2aec7107a"
  },
  {
    "question_id": "7c83eb73-eacd-4084-ab77-d2f572db7d29",
    "technique_id": "c17f093e-c470-44bb-a5ac-8da617814b58",
    "display_code": "M-00955",
    "row_md5": "ab7f01921bcfe1cf52ca8ecae3b1055b"
  },
  {
    "question_id": "4cbd1a7a-8f95-4228-b70d-81594644285a",
    "technique_id": "c17f093e-c470-44bb-a5ac-8da617814b58",
    "display_code": "M-01010",
    "row_md5": "4bf18314cd77235f62d66aa1a096e6ce"
  },
  {
    "question_id": "1858f647-d19e-40ca-a8c3-675a63063c46",
    "technique_id": "c17f093e-c470-44bb-a5ac-8da617814b58",
    "display_code": "M-01047",
    "row_md5": "a25fbd4fcd77c9c915cdfe8f8902137c"
  },
  {
    "question_id": "d52a39ee-34ea-4208-a952-2e3ab574dfaa",
    "technique_id": "c17f093e-c470-44bb-a5ac-8da617814b58",
    "display_code": "M-01122",
    "row_md5": "4721f08c3577b2c7527b8ea6970f1b13"
  },
  {
    "question_id": "ae1c18ac-e55a-4a96-830a-0ae2ec57d5a1",
    "technique_id": "c17f093e-c470-44bb-a5ac-8da617814b58",
    "display_code": "M-01147",
    "row_md5": "0e14034afac8623c0485bd09cbc7cc27"
  },
  {
    "question_id": "7906e0eb-7433-4857-a54c-15f1ed07747f",
    "technique_id": "c17f093e-c470-44bb-a5ac-8da617814b58",
    "display_code": "M-01373",
    "row_md5": "5404ee8fafd5c5ccef21f711b46eb656"
  },
  {
    "question_id": "2e997f15-47de-49d2-9ac6-a5c99e0db1e9",
    "technique_id": "c17f093e-c470-44bb-a5ac-8da617814b58",
    "display_code": "M-01656",
    "row_md5": "7f867c60c0824f566630e19e632f1d3e"
  },
  {
    "question_id": "43e058e9-d786-4173-bf8b-e3a5c4892556",
    "technique_id": "c17f093e-c470-44bb-a5ac-8da617814b58",
    "display_code": "M-01785",
    "row_md5": "83f804ac23c3e40f96d81100447ff2cf"
  },
  {
    "question_id": "43f57c8f-1fb3-456f-936a-6184dce48943",
    "technique_id": "c17f093e-c470-44bb-a5ac-8da617814b58",
    "display_code": "M-01792",
    "row_md5": "ddd8d0b1b73558e21f2da32f2798c60e"
  },
  {
    "question_id": "e6ae0e9f-de92-4e3b-bc5a-b4f33a836e34",
    "technique_id": "c17f093e-c470-44bb-a5ac-8da617814b58",
    "display_code": "M-01804",
    "row_md5": "b9763cb049a7bfd6d46f627f807246e0"
  },
  {
    "question_id": "253fe436-ea35-483b-bc95-584dd365c220",
    "technique_id": "bb7d123b-b6b6-4788-8ae2-cab3db66bf87",
    "display_code": "M-00066",
    "row_md5": "6dd54bf8295a1eb0baa5989d5c81c953"
  },
  {
    "question_id": "a1d3d6b6-405a-4d7d-9649-2d2f70d116a8",
    "technique_id": "bb7d123b-b6b6-4788-8ae2-cab3db66bf87",
    "display_code": "M-00114",
    "row_md5": "564b6567e1dc46d9c26cef1bfd5a4d96"
  },
  {
    "question_id": "9a3979a8-84cf-4106-922b-363a0e2eae2c",
    "technique_id": "bb7d123b-b6b6-4788-8ae2-cab3db66bf87",
    "display_code": "M-00119",
    "row_md5": "2b0a7c9bb7cad053d8bb7e75d6f258a7"
  },
  {
    "question_id": "df85c8b8-1eeb-444b-b178-6ac8a811bb98",
    "technique_id": "bb7d123b-b6b6-4788-8ae2-cab3db66bf87",
    "display_code": "M-00140",
    "row_md5": "b8fe0891eda29721f81cbd4b9f3f748d"
  },
  {
    "question_id": "7d3c20e3-b244-429d-8c2e-e8807b5811b8",
    "technique_id": "bb7d123b-b6b6-4788-8ae2-cab3db66bf87",
    "display_code": "M-00163",
    "row_md5": "2957adb6b3a17808823818d1525bd1c2"
  },
  {
    "question_id": "b8ad40fc-8e9f-407d-9c7f-ab94ca7e13c0",
    "technique_id": "bb7d123b-b6b6-4788-8ae2-cab3db66bf87",
    "display_code": "M-00243",
    "row_md5": "d205e8d34b298089c70d7d06e72f4777"
  },
  {
    "question_id": "2e683e76-2b6b-4c07-b8dd-fe3c08447e36",
    "technique_id": "bb7d123b-b6b6-4788-8ae2-cab3db66bf87",
    "display_code": "M-00426",
    "row_md5": "afccc8720a8553dff9bbd977281899aa"
  },
  {
    "question_id": "5fe6c428-7b36-4ead-bde8-522a572a5703",
    "technique_id": "bb7d123b-b6b6-4788-8ae2-cab3db66bf87",
    "display_code": "M-00499",
    "row_md5": "c5d5eaeacbeeb6713c888c3857736116"
  },
  {
    "question_id": "70271211-91c9-4e15-99ba-b38bc1ada345",
    "technique_id": "bb7d123b-b6b6-4788-8ae2-cab3db66bf87",
    "display_code": "M-00533",
    "row_md5": "16f9e388fcbe9972ea2bfd598645dddf"
  },
  {
    "question_id": "1bcd6ab0-a45e-42e5-80f6-7356a793e87e",
    "technique_id": "bb7d123b-b6b6-4788-8ae2-cab3db66bf87",
    "display_code": "M-00565",
    "row_md5": "7ac6c3eea828c03597703b33990c34c7"
  },
  {
    "question_id": "76a5b19e-0ee6-453f-a4c6-430ce6733cd7",
    "technique_id": "bb7d123b-b6b6-4788-8ae2-cab3db66bf87",
    "display_code": "M-00749",
    "row_md5": "09fd4ca8088bb0bfcabaa0d0c4ae0d9c"
  },
  {
    "question_id": "edc88fe5-a0e5-41a5-a664-08cc80141514",
    "technique_id": "bb7d123b-b6b6-4788-8ae2-cab3db66bf87",
    "display_code": "M-00781",
    "row_md5": "e0ecef31cc7ded72ebb319f87efc7d33"
  },
  {
    "question_id": "4e4fc14f-60f2-46f0-a614-17a7aea225e7",
    "technique_id": "bb7d123b-b6b6-4788-8ae2-cab3db66bf87",
    "display_code": "M-00812",
    "row_md5": "82d6fada2ec0adace7eaaaa167907762"
  },
  {
    "question_id": "47b3e2aa-d73f-45d4-b5a6-6edec02d4f36",
    "technique_id": "bb7d123b-b6b6-4788-8ae2-cab3db66bf87",
    "display_code": "M-00962",
    "row_md5": "fe399fba4f73124aed023b0b0f9244b9"
  },
  {
    "question_id": "a2165095-6897-428b-b5fe-3e83eed3ad5e",
    "technique_id": "bb7d123b-b6b6-4788-8ae2-cab3db66bf87",
    "display_code": "M-01016",
    "row_md5": "c7813a4ed34e6678bccc7270a68387a3"
  },
  {
    "question_id": "a7e69018-adcc-49aa-b7d2-aa35b369c510",
    "technique_id": "bb7d123b-b6b6-4788-8ae2-cab3db66bf87",
    "display_code": "M-01044",
    "row_md5": "c4a424cf7d0cb8393f4afdc7229c2234"
  },
  {
    "question_id": "383bc001-792f-4e5f-8c9a-49279f5a85d0",
    "technique_id": "bb7d123b-b6b6-4788-8ae2-cab3db66bf87",
    "display_code": "M-01046",
    "row_md5": "d4ca82920448e53338da7fc6282787e9"
  },
  {
    "question_id": "e23bdb30-0a1f-43b7-85b2-3b3a7311d889",
    "technique_id": "bb7d123b-b6b6-4788-8ae2-cab3db66bf87",
    "display_code": "M-01292",
    "row_md5": "57870c9067d994c80521d71ae48d80dd"
  },
  {
    "question_id": "4c0ee100-c119-4673-a673-f1f8bbefa448",
    "technique_id": "bb7d123b-b6b6-4788-8ae2-cab3db66bf87",
    "display_code": "M-01626",
    "row_md5": "fe876e81b4c5b232baab474189cb7909"
  },
  {
    "question_id": "577ce5ad-d40f-429b-82fd-c2652dd0a167",
    "technique_id": "bb7d123b-b6b6-4788-8ae2-cab3db66bf87",
    "display_code": "M-01841",
    "row_md5": "63f40028dd65bfb8b491ccbb2615e6b2"
  },
  {
    "question_id": "fe397522-6755-4c18-9e55-f9d19df80eb3",
    "technique_id": "b7d8cbf7-cecf-443e-90b2-abb9650236c8",
    "display_code": "M-00103",
    "row_md5": "5f93f296b4e91dacf214dcd8e458133e"
  },
  {
    "question_id": "70e8c044-cfa8-416c-b968-c26df63b98b8",
    "technique_id": "b7d8cbf7-cecf-443e-90b2-abb9650236c8",
    "display_code": "M-00175",
    "row_md5": "691ef5155188e26eca60f99b7e3c9bff"
  },
  {
    "question_id": "7c4b4383-064d-451a-b6b2-4969182b31cd",
    "technique_id": "b7d8cbf7-cecf-443e-90b2-abb9650236c8",
    "display_code": "M-00257",
    "row_md5": "6cc86820e05d0b275a0094c6acccd1da"
  },
  {
    "question_id": "0baae83c-6a18-419f-ba1a-7c6253ef7d56",
    "technique_id": "b7d8cbf7-cecf-443e-90b2-abb9650236c8",
    "display_code": "M-00327",
    "row_md5": "fe53a54eefd497ff7b6d71fe07c843a3"
  },
  {
    "question_id": "d14683b1-75fa-4dd4-a083-bedf544b8401",
    "technique_id": "b7d8cbf7-cecf-443e-90b2-abb9650236c8",
    "display_code": "M-00333",
    "row_md5": "2ed54e3a54d138b634409d4178e472f2"
  },
  {
    "question_id": "373b3889-ebb4-4ded-b658-60dd4099063d",
    "technique_id": "b7d8cbf7-cecf-443e-90b2-abb9650236c8",
    "display_code": "M-00344",
    "row_md5": "ccabfc0f61db0b6987da0d3db8ce1827"
  },
  {
    "question_id": "41935d3e-648b-488b-83f3-a74b80e7b75f",
    "technique_id": "b7d8cbf7-cecf-443e-90b2-abb9650236c8",
    "display_code": "M-00383",
    "row_md5": "eb624c7b2d19a84164a66565b46ec7f3"
  },
  {
    "question_id": "e76da76b-5739-4bd3-aed0-53e7ba48eb3c",
    "technique_id": "b7d8cbf7-cecf-443e-90b2-abb9650236c8",
    "display_code": "M-00433",
    "row_md5": "2b81337b4023629387028b4aef21cd71"
  },
  {
    "question_id": "fe91f5f3-44dc-4f11-9c40-a6d436cc19bd",
    "technique_id": "b7d8cbf7-cecf-443e-90b2-abb9650236c8",
    "display_code": "M-00437",
    "row_md5": "d8fca5e90083439d52a987ab09e43abe"
  },
  {
    "question_id": "72502869-da14-459b-a52c-f3604969fdaa",
    "technique_id": "b7d8cbf7-cecf-443e-90b2-abb9650236c8",
    "display_code": "M-00487",
    "row_md5": "a60a500b9d714a64fbc199ec62bd23af"
  },
  {
    "question_id": "d19ee415-9a13-4e2f-b665-ac01a9862c7f",
    "technique_id": "b7d8cbf7-cecf-443e-90b2-abb9650236c8",
    "display_code": "M-00629",
    "row_md5": "91ea69d5435aec735a3ccd49b46e62b8"
  },
  {
    "question_id": "75a495fb-b11c-4e13-9e53-91026b86efbf",
    "technique_id": "b7d8cbf7-cecf-443e-90b2-abb9650236c8",
    "display_code": "M-00695",
    "row_md5": "b2f28eb718e501304d9dbf0eddfccaa8"
  },
  {
    "question_id": "eba4bd46-586f-4d90-8e73-07aa813f9f6b",
    "technique_id": "b7d8cbf7-cecf-443e-90b2-abb9650236c8",
    "display_code": "M-00699",
    "row_md5": "4e6b24d95f7fa43d4d5bbaffe5ebac5d"
  },
  {
    "question_id": "df1fac0e-d68f-494d-99e2-04b06df24811",
    "technique_id": "b7d8cbf7-cecf-443e-90b2-abb9650236c8",
    "display_code": "M-00701",
    "row_md5": "77da621d4ba66a4136244979479ea343"
  },
  {
    "question_id": "a6fbd145-3e5d-4e21-9d74-84365e37a974",
    "technique_id": "b7d8cbf7-cecf-443e-90b2-abb9650236c8",
    "display_code": "M-00711",
    "row_md5": "65439b065bd8d5c91c05ba1d5a303857"
  },
  {
    "question_id": "527eab2c-ca76-4b0f-b8b2-2ebe37864338",
    "technique_id": "b7d8cbf7-cecf-443e-90b2-abb9650236c8",
    "display_code": "M-00769",
    "row_md5": "5ca32f584c90e184379ab193cf669bf8"
  },
  {
    "question_id": "3aa59949-0165-46dd-b45b-4c14b678f85e",
    "technique_id": "b7d8cbf7-cecf-443e-90b2-abb9650236c8",
    "display_code": "M-00813",
    "row_md5": "7fe8f59946c938952b9686fe7dafdcaa"
  },
  {
    "question_id": "e0d4f678-7ca4-44b7-8988-c35322ab84e0",
    "technique_id": "b7d8cbf7-cecf-443e-90b2-abb9650236c8",
    "display_code": "M-01115",
    "row_md5": "c55ae43ea7a8877a78c9dde0eae01366"
  },
  {
    "question_id": "90a9d9d5-1003-401c-8e8b-d88cd9491757",
    "technique_id": "b7d8cbf7-cecf-443e-90b2-abb9650236c8",
    "display_code": "M-01702",
    "row_md5": "aed54435cdd8e0094d3cff769ca2b2c2"
  },
  {
    "question_id": "2a11ed87-ab70-411d-9e92-a3b543ab4988",
    "technique_id": "b7d8cbf7-cecf-443e-90b2-abb9650236c8",
    "display_code": "M-01758",
    "row_md5": "2e3bb4056d678589310c55ff52862eed"
  },
  {
    "question_id": "a811ce81-e3e5-4568-ba89-da68b3097736",
    "technique_id": "c63e0dc5-986a-4732-862c-5c3a605a0667",
    "display_code": "M-00202",
    "row_md5": "034277b7a05936011defdf4336421e58"
  },
  {
    "question_id": "a71d4ae3-ef7a-4d75-be13-c9cf5c26082b",
    "technique_id": "c63e0dc5-986a-4732-862c-5c3a605a0667",
    "display_code": "M-00295",
    "row_md5": "2c53b5b8fe519a274665c28109ee0b14"
  },
  {
    "question_id": "7ad4797c-ba5f-4323-baa3-5620c04c944f",
    "technique_id": "c63e0dc5-986a-4732-862c-5c3a605a0667",
    "display_code": "M-00346",
    "row_md5": "14fb809b851f675055436542fb0fccfe"
  },
  {
    "question_id": "2658fb4a-9333-494a-b67c-e7f139d29678",
    "technique_id": "c63e0dc5-986a-4732-862c-5c3a605a0667",
    "display_code": "M-00445",
    "row_md5": "4c1e0835af5d422742535141b303c7d5"
  },
  {
    "question_id": "1f26532b-a9e6-42b4-a675-2b8e19f7a8d4",
    "technique_id": "c63e0dc5-986a-4732-862c-5c3a605a0667",
    "display_code": "M-00572",
    "row_md5": "12cbd05017f804a7c716f55d55869c0b"
  },
  {
    "question_id": "ca14bca5-88f1-4c97-b899-e26bbe659abd",
    "technique_id": "c63e0dc5-986a-4732-862c-5c3a605a0667",
    "display_code": "M-00720",
    "row_md5": "7ea313a2a3f7e916cd0010bd2d4e9347"
  },
  {
    "question_id": "86e5b66c-e8fd-4474-a39e-7e968751158c",
    "technique_id": "c63e0dc5-986a-4732-862c-5c3a605a0667",
    "display_code": "M-00728",
    "row_md5": "6b1f05675f04b7dd557f07b42bc342e1"
  },
  {
    "question_id": "22d994db-67e0-4956-ac98-afcafd51f309",
    "technique_id": "c63e0dc5-986a-4732-862c-5c3a605a0667",
    "display_code": "M-00811",
    "row_md5": "b561ddbf8d0c8a7f142f25ed3853948f"
  },
  {
    "question_id": "f5e199b9-0d7c-4de0-93a1-5f9da922689a",
    "technique_id": "c63e0dc5-986a-4732-862c-5c3a605a0667",
    "display_code": "M-00850",
    "row_md5": "e38cb3b359f77def4da35d7f63f323a3"
  },
  {
    "question_id": "80b031af-4dad-470a-a9ab-d4157052500e",
    "technique_id": "c63e0dc5-986a-4732-862c-5c3a605a0667",
    "display_code": "M-00860",
    "row_md5": "d08724daab5a0a9289743b897d2f1591"
  },
  {
    "question_id": "cc0b855e-7d34-4e29-853e-e31387de752d",
    "technique_id": "c63e0dc5-986a-4732-862c-5c3a605a0667",
    "display_code": "M-00952",
    "row_md5": "c9dc796d4fe56fae9006d5e8a3c80f20"
  },
  {
    "question_id": "c86416c7-3edb-4e6d-bc41-540b8e10473c",
    "technique_id": "c63e0dc5-986a-4732-862c-5c3a605a0667",
    "display_code": "M-01060",
    "row_md5": "856c450768e9bb6bc1a61e5dacb65318"
  },
  {
    "question_id": "90392610-f97a-4c39-ab2d-90b9b89547be",
    "technique_id": "c63e0dc5-986a-4732-862c-5c3a605a0667",
    "display_code": "M-01200",
    "row_md5": "c5aee2aa43ab83691b35b869ad81209c"
  },
  {
    "question_id": "b22ef144-3055-408f-8271-246d35b4e3b4",
    "technique_id": "c63e0dc5-986a-4732-862c-5c3a605a0667",
    "display_code": "M-01363",
    "row_md5": "0e8edfe484380ccebcf2c554596fe1f6"
  },
  {
    "question_id": "f950959d-5ed8-48de-8a83-cce22609f29e",
    "technique_id": "c63e0dc5-986a-4732-862c-5c3a605a0667",
    "display_code": "M-01459",
    "row_md5": "e6cb7332a02a1776a836059c29b2de93"
  },
  {
    "question_id": "eb336806-d901-4e8d-aebe-40ae8f815dcf",
    "technique_id": "c63e0dc5-986a-4732-862c-5c3a605a0667",
    "display_code": "M-01479",
    "row_md5": "23abaf839dd6fbae81f569c1423c5b45"
  },
  {
    "question_id": "7eca763c-aa7d-4d0d-9e01-ffe7e6e55c6f",
    "technique_id": "c63e0dc5-986a-4732-862c-5c3a605a0667",
    "display_code": "M-01551",
    "row_md5": "9fe22b52a949ff2c5fef5abc638bf3ca"
  },
  {
    "question_id": "d5f6b3d6-61e3-4789-8e34-3aa949a549a1",
    "technique_id": "c63e0dc5-986a-4732-862c-5c3a605a0667",
    "display_code": "M-01891",
    "row_md5": "ddf3ae25011909b03178c2bbb660566d"
  },
  {
    "question_id": "66f9ab78-4415-487a-8e54-c9bc0a54e318",
    "technique_id": "c63e0dc5-986a-4732-862c-5c3a605a0667",
    "display_code": "M-01904",
    "row_md5": "a6fbe6e0ebd5b2bfd72204d2cabe6120"
  },
  {
    "question_id": "b042b77a-8799-4ac1-a59f-eca06c0b12c3",
    "technique_id": "c63e0dc5-986a-4732-862c-5c3a605a0667",
    "display_code": "M-01920",
    "row_md5": "a9ff4bded81a945ad59a2327f930629d"
  },
  {
    "question_id": "dc453b23-afba-4ee6-846c-2185b8245494",
    "technique_id": "cabdb007-25b3-4172-8678-25c55adb8c31",
    "display_code": "M-00045",
    "row_md5": "08216c504e926a6b62579b57c62c4a1f"
  },
  {
    "question_id": "36ebf221-183f-4609-8da2-97a7ceb16490",
    "technique_id": "cabdb007-25b3-4172-8678-25c55adb8c31",
    "display_code": "M-00068",
    "row_md5": "f0fbf6782a5f618827224d695c5ef8d8"
  },
  {
    "question_id": "5828cf44-aa01-4ed8-8b21-5ecfadeba4f7",
    "technique_id": "cabdb007-25b3-4172-8678-25c55adb8c31",
    "display_code": "M-00101",
    "row_md5": "afe62aff79da4f30de398650458d1343"
  },
  {
    "question_id": "5fdc5f13-6f70-4b19-a76a-7e09bd9160b2",
    "technique_id": "cabdb007-25b3-4172-8678-25c55adb8c31",
    "display_code": "M-00141",
    "row_md5": "a1bf20bc6839728248b9b3be92577573"
  },
  {
    "question_id": "0ea0d6ab-fa0a-478a-a9e3-aa2662166829",
    "technique_id": "cabdb007-25b3-4172-8678-25c55adb8c31",
    "display_code": "M-00173",
    "row_md5": "ff0f68ae94c604147bdb4e0c74797ecf"
  },
  {
    "question_id": "f4c1dde3-7640-46b3-bb48-9361f0ab2b20",
    "technique_id": "cabdb007-25b3-4172-8678-25c55adb8c31",
    "display_code": "M-00258",
    "row_md5": "c3128447e7126084d02e94c13a926472"
  },
  {
    "question_id": "b245dd2e-8d9c-4ac9-9f40-2779e07194da",
    "technique_id": "cabdb007-25b3-4172-8678-25c55adb8c31",
    "display_code": "M-00457",
    "row_md5": "61d37b3624d016cdeadc881d4fa9f7ea"
  },
  {
    "question_id": "cde60a05-5782-44c4-a9a1-1dc792da0770",
    "technique_id": "cabdb007-25b3-4172-8678-25c55adb8c31",
    "display_code": "M-00506",
    "row_md5": "e228079d2dbad873aa56783018581c35"
  },
  {
    "question_id": "017987a5-0708-47bb-8c02-acff4ea3d7e2",
    "technique_id": "cabdb007-25b3-4172-8678-25c55adb8c31",
    "display_code": "M-00592",
    "row_md5": "38facf72436342c7d9c96786170c3409"
  },
  {
    "question_id": "3d15ddbc-c880-406c-813b-314f5768eca9",
    "technique_id": "cabdb007-25b3-4172-8678-25c55adb8c31",
    "display_code": "M-00657",
    "row_md5": "df37f706fb1a08a89bc28a16c178570d"
  },
  {
    "question_id": "41d6d1f5-0846-4555-a652-64dd4f819b8d",
    "technique_id": "cabdb007-25b3-4172-8678-25c55adb8c31",
    "display_code": "M-00693",
    "row_md5": "a76c699a88eb2512dfb7022ff8f7d707"
  },
  {
    "question_id": "b71186a1-24e0-43f1-bcb3-d96f1dd2e714",
    "technique_id": "cabdb007-25b3-4172-8678-25c55adb8c31",
    "display_code": "M-00904",
    "row_md5": "eb7199ba345005867b80382fd1307e78"
  },
  {
    "question_id": "8e1c6ac9-fae5-4374-b5a5-dbb9b49d853c",
    "technique_id": "cabdb007-25b3-4172-8678-25c55adb8c31",
    "display_code": "M-00973",
    "row_md5": "9df76bdf9f4c77a93a772da88c9e8ccc"
  },
  {
    "question_id": "42cb3013-0fac-4112-b370-b22f40b48f5a",
    "technique_id": "cabdb007-25b3-4172-8678-25c55adb8c31",
    "display_code": "M-01144",
    "row_md5": "24c2a1c00b33ee362016f38fc6915bd6"
  },
  {
    "question_id": "c684641d-50b8-4a6b-b03e-6dd18702bb05",
    "technique_id": "cabdb007-25b3-4172-8678-25c55adb8c31",
    "display_code": "M-01182",
    "row_md5": "e500467366487a4dcc9a53d16cc95255"
  },
  {
    "question_id": "cf8877a0-2bce-412b-a7ae-b0558f19dcb0",
    "technique_id": "cabdb007-25b3-4172-8678-25c55adb8c31",
    "display_code": "M-01685",
    "row_md5": "6f578e59aecafe43e1d73cca6aac12bc"
  },
  {
    "question_id": "c7be68c6-1906-417f-9144-43ba8a9017b9",
    "technique_id": "cabdb007-25b3-4172-8678-25c55adb8c31",
    "display_code": "M-01690",
    "row_md5": "871402075d5b4f16a54afc957b619d4b"
  },
  {
    "question_id": "4925f4d7-7fab-4bc3-8a65-1377c03f4561",
    "technique_id": "cabdb007-25b3-4172-8678-25c55adb8c31",
    "display_code": "M-01695",
    "row_md5": "da2e32fa424d3773850e7b688f8cab88"
  },
  {
    "question_id": "daf30213-30bb-4901-a9d8-b107a4a1350a",
    "technique_id": "cabdb007-25b3-4172-8678-25c55adb8c31",
    "display_code": "M-01864",
    "row_md5": "9dbef23a668be52eebe2234a6f5378e7"
  },
  {
    "question_id": "7fbb6ff3-bdb0-4def-96ee-994e79c1939f",
    "technique_id": "cabdb007-25b3-4172-8678-25c55adb8c31",
    "display_code": "M-01919",
    "row_md5": "69c3ee72bccb056ebfdbf28becda82fd"
  }
]$questions$::jsonb;
  catalog jsonb := $catalog$[
  {
    "id": "c63e0dc5-986a-4732-862c-5c3a605a0667",
    "name": "Circle geometric relationships",
    "row_md5": "5f46779c4abf78e8780510559da95408"
  },
  {
    "id": "cabdb007-25b3-4172-8678-25c55adb8c31",
    "name": "Circle graphs",
    "row_md5": "63232e7908915d8c9e106940b9d1daff"
  },
  {
    "id": "bb7d123b-b6b6-4788-8ae2-cab3db66bf87",
    "name": "Graph Match: equivalent expressions by graphing",
    "row_md5": "f7a3922c518ae055205aa09b62da54fc"
  },
  {
    "id": "c17f093e-c470-44bb-a5ac-8da617814b58",
    "name": "Multiple Percent Equations",
    "row_md5": "c31b3d66b0a1d220c7b085b7666f88e4"
  },
  {
    "id": "b7d8cbf7-cecf-443e-90b2-abb9650236c8",
    "name": "Translate, Graph, Read: linear inequalities",
    "row_md5": "220dd4c90ad8f3f9c4d2477119cfb674"
  }
]$catalog$::jsonb;
  inserted integer;
begin
  if jsonb_array_length(reviewed) <> 100 or jsonb_array_length(catalog) <> 5 then
    raise exception 'Expected 100 reviewed tags across five techniques';
  end if;
  if (select count(distinct (r.question_id, r.technique_id))
      from jsonb_to_recordset(reviewed) as r(question_id uuid, technique_id uuid)) <> 100 then
    raise exception 'Duplicate reviewed question/technique pair';
  end if;

  -- Hold the reviewed rows stable through validation and insertion.
  perform q.id
  from public.questions_v2 q
  join jsonb_to_recordset(reviewed) as r(question_id uuid) on r.question_id = q.id
  for share of q;
  perform t.id
  from public.techniques t
  join jsonb_to_recordset(catalog) as c(id uuid) on c.id = t.id
  for share of t;

  if exists (
    select 1
    from jsonb_to_recordset(reviewed) as r(question_id uuid, technique_id uuid, display_code text, row_md5 text)
    left join public.questions_v2 q on q.id = r.question_id
    left join public.techniques t on t.id = r.technique_id
    where q.id is null or t.id is null
      or q.display_code is distinct from r.display_code
      or q.pool is distinct from 'standard'
      or q.is_published is distinct from true
      or q.is_broken is distinct from false
      or q.deleted_at is not null
      or q.domain_code not in ('H', 'P', 'Q', 'S')
      or t.test_type is distinct from 'sat'
      or t.section is distinct from 'math'
      or md5(to_jsonb(q)::text) is distinct from r.row_md5
  ) then
    raise exception 'A reviewed question is missing, changed, or no longer eligible';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(catalog) as c(id uuid, name text, row_md5 text)
    left join public.techniques t on t.id = c.id
    where t.id is null or t.name is distinct from c.name
      or md5(to_jsonb(t)::text) is distinct from c.row_md5
  ) then
    raise exception 'A reviewed technique definition has changed';
  end if;

  insert into public.question_techniques (question_id, technique_id, tagged_by)
  select r.question_id, r.technique_id, null
  from jsonb_to_recordset(reviewed) as r(question_id uuid, technique_id uuid)
  on conflict (question_id, technique_id) do nothing;
  get diagnostics inserted = row_count;

  if exists (
    select 1
    from jsonb_to_recordset(reviewed) as r(question_id uuid, technique_id uuid)
    left join public.question_techniques qt
      on qt.question_id = r.question_id and qt.technique_id = r.technique_id
    where qt.question_id is null
  ) then
    raise exception 'A reviewed tag is missing after insertion';
  end if;
  raise notice 'Added % technique tags; retained all pre-existing tags', inserted;
end
$tagging$;
commit;

select t.id, t.name, count(qt.question_id) as tagged_count
from public.techniques t
left join public.question_techniques qt on qt.technique_id = t.id
where t.id in ('c17f093e-c470-44bb-a5ac-8da617814b58', 'bb7d123b-b6b6-4788-8ae2-cab3db66bf87', 'b7d8cbf7-cecf-443e-90b2-abb9650236c8', 'c63e0dc5-986a-4732-862c-5c3a605a0667', 'cabdb007-25b3-4172-8678-25c55adb8c31')
group by t.id, t.name
order by t.name;
