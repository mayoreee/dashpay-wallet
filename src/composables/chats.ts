import { ref, computed } from "vue";
import { strict as assert } from "assert";
import { getClient, getClientIdentity } from "../lib/DashClient";
import { useStore } from "vuex";
import useRates from "@/composables/rates";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createContactRequest } = require("../lib/crypto/dashpay-crypto");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let client: any;

let isRefreshLoopActive = false;

export default function useChats() {
  const store = useStore();

  const { dashInDuffs, getFiatSymbol, duffsInFiatNumber } = useRates();

  console.log("store :>> ", store);

  const sentContactRequest = computed(
    () => store.getters.getSentContactRequest
  );

  const receivedContactRequest = computed(
    () => store.getters.getReceivedContactRequest
  );

  const getChatMsgs = computed(() => store.getters.getChatMsgs);

  const getChatMsgById = computed(() => store.getters.getChatMsgById);

  const getRequestByReplyToId = computed(
    () => store.getters.getRequestByReplyToId
  );

  async function syncChatsLoop() {
    if (!isRefreshLoopActive) return;
    console.log("syncChatsLoop");
    store.dispatch("syncChats");
    await sleep(5000);
    syncChatsLoop();
  }

  function startSyncChats() {
    assert(
      !isRefreshLoopActive,
      "Error: syncChats refresh loop already running!"
    );

    console.log("startSyncChats");
    isRefreshLoopActive = true;

    syncChatsLoop();
  }

  function stopSyncChats() {
    isRefreshLoopActive = false;
  }

  const sendChat = async (
    chatText: string,
    friendOwnerId: string,
    amount = 0,
    request = "",
    replyToChatId = ""
  ) => {
    console.log("sendChat", { chatText, friendOwnerId, amount, request });

    const client = getClient();
    console.log("logged in with mnemonic :>> ", client?.wallet?.exportWallet());

    const duffs = dashInDuffs.value(amount);

    const docProperties = {
      text: chatText,
      txId: "",
      replyToChatId,
      toOwnerId: friendOwnerId,
      amount: amount ? duffs : undefined,
      request: request || undefined,
      fiatSymbol: getFiatSymbol.value || undefined,
      fiatAmount: duffsInFiatNumber.value(duffs) || undefined,
    };

    console.log("sendChat docProperties :>> ", docProperties);

    const document = await client.platform?.documents.create(
      "dashpayWallet.chat",
      getClientIdentity(),
      docProperties
    );

    console.log("sendChat document :>> ", document);

    const documentBatch = {
      create: [document],
      replace: [],
      delete: [],
    };

    // Attach contact request if we haven't sent one before
    if (!store.getters.getSentContactRequest(friendOwnerId)) {
      const contactRequest = await createContactRequest(
        client,
        getClientIdentity(),
        friendOwnerId
      );

      documentBatch.create.push(contactRequest);
    }

    console.log("sendChat broadcasting", {
      documentBatch,
      clientIdenity: getClientIdentity(),
    });

    // TODO handle duplicate error if contactRequest exists and resend the chatMsg only
    const result = await client.platform?.documents.broadcast(
      documentBatch,
      getClientIdentity()
    );

    console.log("sendChat result :>> ", result);

    // On successful ST immediately set the contactRequest in state
    // TODO commit contact request to state for faster UX
    // if (result.transitions[1])
    //   existingContactRequest.value = {
    //     ...result.transitions[1],
    //     friendOwnerId: result.ownerId,
    //   };

    // TODO add sent transition to store.state and deduplicate on next sync

    // console.dir(result.transitions[0].toJSON(), { depth: 100 });

    // const chatSent = result.transitions[0];

    // chatSent.ownerId = result.ownerId;

    // chatMsgsSent.value.push(chatSent);
  };

  return {
    startSyncChats,
    stopSyncChats,
    sendChat,
    getChatMsgs,
    getChatMsgById,
    getRequestByReplyToId,
    sentContactRequest,
    receivedContactRequest,
  };
}
