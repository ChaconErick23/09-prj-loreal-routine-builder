"use strict";

/*
  This is the same Worker URL used in Project 8.

  Redeploy the updated Worker code from
  RESOURCE_cloudflare-worker.js to this Worker
  before testing Project 9.
*/

const WORKER_URL =
  "https://loreal-beauty-advisor.echacon1.workers.dev/";

const STORAGE_KEYS = {
  selectedProducts:
    "lorealRoutineBuilderSelectedProducts",

  routineGoals:
    "lorealRoutineBuilderGoals",

  rtlMode:
    "lorealRoutineBuilderRtlMode",

  webSearch:
    "lorealRoutineBuilderWebSearch"
};

const SYSTEM_PROMPT = `
You are the L'Oréal Product-Aware Beauty Advisor.

Your job:
- Build useful routines using ONLY the products included in the selected-products JSON when the user asks for a routine based on selections.
- Put products in a sensible order and separate morning, evening, haircare, makeup, fragrance, or other sections when relevant.
- Explain how often and how to use each selected product in concise language.
- Clearly identify products that may not belong in the same routine or that should be alternated.
- For follow-up questions, remember the complete conversation and the selected product data already provided.
- Stay within beauty topics: skincare, haircare, makeup, fragrance, grooming, suncare, product use, and the generated routine.
- Politely redirect unrelated questions back to beauty or the routine.
- Never invent selected-product facts. Base product-specific claims on the supplied JSON. When live web search is enabled, current availability or official-use claims may be supported with sources.
- Ask one short clarifying question only when it is truly necessary. Otherwise, make reasonable, clearly labeled assumptions.

Safety:
- Do not diagnose or treat medical conditions.
- Do not promise medical results.
- Encourage patch testing, label directions, and daily sunscreen when appropriate.
- For severe irritation, swelling, trouble breathing, unusual hair loss, or other medical concerns, advise the user to stop using the product and contact a qualified healthcare professional.
- Mention that combining strong actives may increase irritation when relevant.

Style:
- Warm, polished, practical, and easy to scan.
- Use short headings and numbered steps.
- Keep most answers under 350 words unless the user asks for more detail.
`;

/* Product elements */

const productsContainer =
  document.getElementById(
    "productsContainer"
  );

const emptyProducts =
  document.getElementById(
    "emptyProducts"
  );

const productCount =
  document.getElementById(
    "productCount"
  );

const productSearch =
  document.getElementById(
    "productSearch"
  );

const categoryFilter =
  document.getElementById(
    "categoryFilter"
  );

/* Selected-product elements */

const selectedProductsList =
  document.getElementById(
    "selectedProductsList"
  );

const emptySelection =
  document.getElementById(
    "emptySelection"
  );

const selectedCount =
  document.getElementById(
    "selectedCount"
  );

const clearSelectionsBtn =
  document.getElementById(
    "clearSelections"
  );

const routineGoals =
  document.getElementById(
    "routineGoals"
  );

const generateRoutineBtn =
  document.getElementById(
    "generateRoutine"
  );

/* Chat elements */

const chatWindow =
  document.getElementById(
    "chatWindow"
  );

const chatForm =
  document.getElementById(
    "chatForm"
  );

const userInput =
  document.getElementById(
    "userInput"
  );

const sendBtn =
  document.getElementById(
    "sendBtn"
  );

const chatStatus =
  document.getElementById(
    "chatStatus"
  );

/* Preference elements */

const webSearchToggle =
  document.getElementById(
    "webSearchToggle"
  );

const rtlToggle =
  document.getElementById(
    "rtlToggle"
  );

const currentYear =
  document.getElementById(
    "currentYear"
  );

const showMoreProductsBtn =
  document.getElementById(
    "showMoreProducts"
  );

const workflowSteps =
  document.querySelectorAll(
    ".workflow-step"
  );

/* Application state */

let allProducts = [];

let selectedProductIds =
  loadSelectedProductIds();

let conversationHistory = [];

let routineHasBeenGenerated =
  false;

let isRequestPending =
  false;

let typingRow = null;

const INITIAL_VISIBLE_PRODUCT_COUNT = 8;

let showAllProducts = false;

/* Start the application */

initializeApp();

/* --------------------------------
   Application setup
-------------------------------- */

async function initializeApp() {
  currentYear.textContent =
    new Date().getFullYear();

  restorePreferences();
  bindEvents();

  try {
    const response =
      await fetch("products.json");

    if (!response.ok) {
      throw new Error(
        `products.json returned status ${response.status}.`
      );
    }

    const data =
      await response.json();

    if (
      !Array.isArray(
        data.products
      )
    ) {
      throw new Error(
        "products.json does not contain a products array."
      );
    }

    allProducts =
      data.products;

    removeMissingSavedIds();
    buildCategoryOptions();
    renderProducts();
    renderSelectedProducts();
  } catch (error) {
    console.error(
      "Product loading error:",
      error
    );

    productsContainer.setAttribute(
      "aria-busy",
      "false"
    );

    productsContainer.innerHTML = `
      <div class="empty-state">
        <i
          class="fa-solid fa-triangle-exclamation"
          aria-hidden="true"
        ></i>

        <h3>
          Products could not be loaded
        </h3>

        <p>
          Open the project through Live Server or
          GitHub Pages and confirm that products.json
          is in the root folder.
        </p>
      </div>
    `;
  }
}

/* --------------------------------
   Event listeners
-------------------------------- */

function bindEvents() {
  productSearch.addEventListener(
    "input",
    () => {
      showAllProducts = false;
      renderProducts();
    }
  );

  categoryFilter.addEventListener(
    "change",
    () => {
      showAllProducts = false;
      renderProducts();
    }
  );

  showMoreProductsBtn.addEventListener(
    "click",
    () => {
      showAllProducts =
        !showAllProducts;
      renderProducts();
    }
  );

  workflowSteps.forEach(
    (stepButton) => {
      stepButton.addEventListener(
        "click",
        () => {
          const targetId =
            stepButton.dataset.target;

          const targetSection =
            document.getElementById(
              targetId
            );

          if (targetSection) {
            targetSection.scrollIntoView({
              behavior: "smooth",
              block: "start"
            });
          }
        }
      );
    }
  );

  clearSelectionsBtn.addEventListener(
    "click",
    clearSelections
  );

  generateRoutineBtn.addEventListener(
    "click",
    generateRoutine
  );

  chatForm.addEventListener(
    "submit",
    handleFollowUp
  );

  routineGoals.addEventListener(
    "input",
    () => {
      localStorage.setItem(
        STORAGE_KEYS.routineGoals,
        routineGoals.value
      );
    }
  );

  webSearchToggle.addEventListener(
    "change",
    () => {
      localStorage.setItem(
        STORAGE_KEYS.webSearch,
        String(
          webSearchToggle.checked
        )
      );
    }
  );

  rtlToggle.addEventListener(
    "click",
    toggleRtlMode
  );
}

/* --------------------------------
   Restore saved preferences
-------------------------------- */

function restorePreferences() {
  routineGoals.value =
    localStorage.getItem(
      STORAGE_KEYS.routineGoals
    ) || "";

  const savedWebSearch =
    localStorage.getItem(
      STORAGE_KEYS.webSearch
    );

  webSearchToggle.checked =
    savedWebSearch === null
      ? true
      : savedWebSearch === "true";

  const useRtl =
    localStorage.getItem(
      STORAGE_KEYS.rtlMode
    ) === "true";

  setRtlMode(useRtl);
}

/* --------------------------------
   Build category filter
-------------------------------- */

function buildCategoryOptions() {
  const categories = [
    ...new Set(
      allProducts.map(
        (product) =>
          product.category
      )
    )
  ]
    .filter(Boolean)
    .sort(
      (firstCategory, secondCategory) =>
        firstCategory.localeCompare(
          secondCategory
        )
    );

  categories.forEach(
    (category) => {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        category;

      option.textContent =
        formatCategory(
          category
        );

      categoryFilter.appendChild(
        option
      );
    }
  );
}

/* --------------------------------
   Filter products
-------------------------------- */

function getFilteredProducts() {
  const searchTerm =
    productSearch.value
      .trim()
      .toLowerCase();

  const selectedCategory =
    categoryFilter.value;

  return allProducts.filter(
    (product) => {
      const matchesCategory =
        selectedCategory === "" ||
        product.category ===
          selectedCategory;

      const searchableText = [
        product.name,
        product.brand,
        product.category,
        product.description
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        searchTerm === "" ||
        searchableText.includes(
          searchTerm
        );

      return (
        matchesCategory &&
        matchesSearch
      );
    }
  );
}

/* --------------------------------
   Display products
-------------------------------- */

function renderProducts() {
  const filteredProducts =
    getFilteredProducts();

  const visibleProducts = showAllProducts
    ? filteredProducts
    : filteredProducts.slice(
        0,
        INITIAL_VISIBLE_PRODUCT_COUNT
      );

  productsContainer.innerHTML =
    "";

  productsContainer.setAttribute(
    "aria-busy",
    "false"
  );

  visibleProducts.forEach(
    (product) => {
      productsContainer.appendChild(
        createProductCard(
          product
        )
      );
    }
  );

  const word =
    filteredProducts.length === 1
      ? "product"
      : "products";

  productCount.textContent =
    `${filteredProducts.length} ${word}`;

  emptyProducts.hidden =
    filteredProducts.length !== 0;

  productsContainer.hidden =
    filteredProducts.length === 0;

  const hasMoreProducts =
    filteredProducts.length >
    INITIAL_VISIBLE_PRODUCT_COUNT;

  showMoreProductsBtn.hidden =
    filteredProducts.length === 0 ||
    !hasMoreProducts;

  showMoreProductsBtn.textContent =
    showAllProducts
      ? "Show Less Products"
      : "Show More Products";
}

/* --------------------------------
   Create one product card
-------------------------------- */

function createProductCard(
  product
) {
  const isSelected =
    selectedProductIds.has(
      product.id
    );

  const card =
    document.createElement(
      "article"
    );

  const descriptionId =
    `description-${product.id}`;

  card.className =
    `product-card${
      isSelected
        ? " selected"
        : ""
    }`;

  card.tabIndex = 0;

  card.dataset.productId =
    String(product.id);

  card.setAttribute(
    "role",
    "button"
  );

  card.setAttribute(
    "aria-pressed",
    String(isSelected)
  );

  card.setAttribute(
    "aria-label",
    `${
      isSelected
        ? "Remove"
        : "Select"
    } ${product.brand} ${product.name}`
  );

  card.innerHTML = `
    <span
      class="selection-check"
      aria-hidden="true"
    >
      <i class="fa-solid fa-check"></i>
    </span>

    <div class="product-image-wrap">
      <img
        class="product-image"
        src="${escapeHtml(product.image)}"
        alt="${escapeHtml(product.brand)}
          ${escapeHtml(product.name)}"
        loading="lazy"
      />
    </div>

    <div class="product-content">
      <p class="product-brand">
        ${escapeHtml(product.brand)}
      </p>

      <h3 class="product-name">
        ${escapeHtml(product.name)}
      </h3>

      <span class="product-category">
        ${escapeHtml(
          formatCategory(
            product.category
          )
        )}
      </span>

      <button
        class="description-toggle"
        type="button"
        aria-expanded="false"
        aria-controls="${descriptionId}"
      >
        <span>
          Product details
        </span>

        <i
          class="fa-solid fa-chevron-down"
          aria-hidden="true"
        ></i>
      </button>

      <p
        id="${descriptionId}"
        class="product-description"
        hidden
      >
        ${escapeHtml(
          product.description
        )}
      </p>
    </div>
  `;

  card.addEventListener(
    "click",
    (event) => {
      if (
        event.target.closest(
          ".description-toggle"
        )
      ) {
        return;
      }

      toggleProductSelection(
        product.id
      );
    }
  );

  card.addEventListener(
    "keydown",
    (event) => {
      if (
        event.target.closest(
          ".description-toggle"
        )
      ) {
        return;
      }

      if (
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();

        toggleProductSelection(
          product.id
        );
      }
    }
  );

  const descriptionToggle =
    card.querySelector(
      ".description-toggle"
    );

  const description =
    card.querySelector(
      ".product-description"
    );

  descriptionToggle.addEventListener(
    "click",
    (event) => {
      event.stopPropagation();

      const willOpen =
        descriptionToggle.getAttribute(
          "aria-expanded"
        ) === "false";

      descriptionToggle.setAttribute(
        "aria-expanded",
        String(willOpen)
      );

      description.hidden =
        !willOpen;
    }
  );

  return card;
}

/* --------------------------------
   Select or unselect product
-------------------------------- */

function toggleProductSelection(
  productId
) {
  if (isRequestPending) {
    return;
  }

  if (
    selectedProductIds.has(
      productId
    )
  ) {
    selectedProductIds.delete(
      productId
    );
  } else {
    selectedProductIds.add(
      productId
    );
  }

  saveSelectedProductIds();
  renderProducts();
  renderSelectedProducts();
  invalidateRoutineAfterSelectionChange();
}

/* --------------------------------
   Display selected products
-------------------------------- */

function renderSelectedProducts() {
  const selectedProducts =
    getSelectedProducts();

  selectedProductsList.innerHTML =
    "";

  selectedProducts.forEach(
    (product) => {
      const item =
        document.createElement(
          "div"
        );

      item.className =
        "selected-item";

      item.innerHTML = `
        <img
          src="${escapeHtml(product.image)}"
          alt=""
          aria-hidden="true"
        />

        <div class="selected-item-text">
          <strong
            title="${escapeHtml(product.name)}"
          >
            ${escapeHtml(product.name)}
          </strong>

          <span
            title="${escapeHtml(product.brand)}"
          >
            ${escapeHtml(product.brand)}
          </span>
        </div>

        <button
          class="remove-selection"
          type="button"
          aria-label="Remove
            ${escapeHtml(product.name)}"
        >
          <i
            class="fa-solid fa-xmark"
            aria-hidden="true"
          ></i>
        </button>
      `;

      const removeButton =
        item.querySelector(
          ".remove-selection"
        );

      removeButton.disabled =
        isRequestPending;

      removeButton.addEventListener(
        "click",
        () => {
          if (isRequestPending) {
            return;
          }

          selectedProductIds.delete(
            product.id
          );

          saveSelectedProductIds();
          renderProducts();
          renderSelectedProducts();
          invalidateRoutineAfterSelectionChange();
        }
      );

      selectedProductsList.appendChild(
        item
      );
    }
  );

  selectedCount.textContent =
    String(
      selectedProducts.length
    );

  emptySelection.hidden =
    selectedProducts.length > 0;

  clearSelectionsBtn.disabled =
    selectedProducts.length === 0 ||
    isRequestPending;

  generateRoutineBtn.disabled =
    selectedProducts.length === 0 ||
    isRequestPending;
}

/* --------------------------------
   Clear all products
-------------------------------- */

function clearSelections() {
  selectedProductIds.clear();

  saveSelectedProductIds();
  renderProducts();
  renderSelectedProducts();
  invalidateRoutineAfterSelectionChange();
}

/* --------------------------------
   Reset chat after selections change
-------------------------------- */

function invalidateRoutineAfterSelectionChange() {
  if (
    !routineHasBeenGenerated
  ) {
    return;
  }

  routineHasBeenGenerated =
    false;

  conversationHistory = [];

  setChatEnabled(false);

  chatStatus.textContent =
    "Selections changed";

  chatStatus.classList.remove(
    "ready"
  );

  appendMessage(
    "assistant",
    "Your product selections changed. Generate a new routine so my next answers use the updated product list."
  );
}

/* --------------------------------
   Generate routine
-------------------------------- */

async function generateRoutine() {
  const selectedProducts =
    getSelectedProducts();

  if (
    selectedProducts.length === 0 ||
    isRequestPending
  ) {
    return;
  }

  /*
    Only the selected products are
    included in this JSON.
  */

  const cleanProducts =
    selectedProducts.map(
      (product) => ({
        id: product.id,
        brand: product.brand,
        name: product.name,
        category: product.category,
        description:
          product.description
      })
    );

  const goals =
    routineGoals.value.trim();

  const routineRequest = `
Create a personalized routine using only the selected products below.

User goals or preferences:
${
  goals ||
  "No extra preferences were provided. Make reasonable assumptions and clearly state them."
}

Selected products JSON:
${JSON.stringify(cleanProducts, null, 2)}

Requirements:
1. Use every selected product unless there is a clear safety, duplication, or compatibility reason not to; explain any product you leave out.
2. Organize the products in the correct application order.
3. Separate morning and evening routines when skincare is selected.
4. Add frequency, important cautions, and one brief patch-test reminder when relevant.
5. Do not add unselected products as required steps. You may mention a general missing step, such as sunscreen, as an optional gap without inventing a selected product.
`;

  /*
    Reset history when a new routine
    is generated.
  */

  conversationHistory = [
    {
      role: "system",
      content: SYSTEM_PROMPT
    },
    {
      role: "user",
      content: routineRequest
    }
  ];

  resetChatWindow();

  appendMessage(
    "user",
    `Build my routine with ${
      selectedProducts.length
    } selected ${
      selectedProducts.length === 1
        ? "product"
        : "products"
    }${
      goals
        ? `\nGoals: ${goals}`
        : ""
    }`
  );

  await requestAssistantResponse({
    isRoutineRequest: true
  });
}

/* --------------------------------
   Submit follow-up question
-------------------------------- */

async function handleFollowUp(
  event
) {
  event.preventDefault();

  const question =
    userInput.value.trim();

  if (
    !question ||
    !routineHasBeenGenerated ||
    isRequestPending
  ) {
    return;
  }

  userInput.value = "";

  appendMessage(
    "user",
    question
  );

  /*
    Add every user message to the
    conversation history.
  */

  conversationHistory.push({
    role: "user",
    content: question
  });

  await requestAssistantResponse({
    isRoutineRequest: false
  });
}

/* --------------------------------
   Send request to Worker
-------------------------------- */

async function requestAssistantResponse({
  isRoutineRequest
}) {
  setRequestPending(
    true,
    isRoutineRequest
  );

  showTypingIndicator();

  try {
    validateWorkerUrl();

    /*
      The complete conversationHistory
      array is sent each time.
    */

    const response =
      await fetch(
        WORKER_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            messages:
              conversationHistory,

            useWebSearch:
              webSearchToggle.checked
          })
        }
      );

    const data =
      await response
        .json()
        .catch(() => null);

    if (!response.ok) {
      const apiMessage =
        data?.error?.message ||
        `Request failed with status ${response.status}.`;

      throw new Error(
        apiMessage
      );
    }

    const assistantMessage =
      data?.choices?.[0]?.message;

    const assistantText =
      assistantMessage?.content
        ?.trim();

    if (!assistantText) {
      throw new Error(
        "The AI response did not contain any text."
      );
    }

    /*
      Save the assistant's answer so
      future questions include it.
    */

    conversationHistory.push({
      role: "assistant",
      content: assistantText
    });

    appendMessage(
      "assistant",
      assistantText,
      extractSourceLinks(
        assistantMessage.annotations
      )
    );

    if (isRoutineRequest) {
      routineHasBeenGenerated =
        true;

      setChatEnabled(true);

      chatStatus.textContent =
        "Routine ready";

      chatStatus.classList.add(
        "ready"
      );

      userInput.focus();
    }
  } catch (error) {
    console.error(
      "AI request error:",
      error
    );

    appendMessage(
      "assistant",
      createFriendlyErrorMessage(
        error
      )
    );

    if (isRoutineRequest) {
      routineHasBeenGenerated =
        false;

      setChatEnabled(false);

      chatStatus.textContent =
        "Could not generate";

      chatStatus.classList.remove(
        "ready"
      );
    }
  } finally {
    removeTypingIndicator();

    setRequestPending(
      false,
      isRoutineRequest
    );
  }
}

/* --------------------------------
   Add message to chat window
-------------------------------- */

function appendMessage(
  role,
  text,
  sources = []
) {
  const row =
    document.createElement(
      "div"
    );

  row.className =
    `message-row ${role}`;

  const avatar =
    document.createElement(
      "div"
    );

  avatar.className =
    "message-avatar";

  avatar.setAttribute(
    "aria-hidden",
    "true"
  );

  avatar.textContent =
    role === "assistant"
      ? "L"
      : "U";

  const bubble =
    document.createElement(
      "div"
    );

  bubble.className =
    "message-bubble";

  renderSimpleMarkdown(
    bubble,
    text
  );

  /*
    Display clickable web sources
    when the API returns citations.
  */

  if (sources.length > 0) {
    const sourceList =
      document.createElement(
        "div"
      );

    sourceList.className =
      "source-list";

    sourceList.setAttribute(
      "aria-label",
      "Sources"
    );

    sources.forEach(
      (source, index) => {
        const link =
          document.createElement(
            "a"
          );

        link.href =
          source.url;

        link.target =
          "_blank";

        link.rel =
          "noopener noreferrer";

        link.title =
          source.title;

        link.innerHTML = `
          <i
            class="fa-solid fa-arrow-up-right-from-square"
            aria-hidden="true"
          ></i>
        `;

        link.appendChild(
          document.createTextNode(
            ` ${
              source.title ||
              `Source ${index + 1}`
            }`
          )
        );

        sourceList.appendChild(
          link
        );
      }
    );

    bubble.appendChild(
      sourceList
    );
  }

  row.append(
    avatar,
    bubble
  );

  chatWindow.appendChild(
    row
  );

  scrollChatToBottom();
}

/* --------------------------------
   Display basic markdown
-------------------------------- */

function renderSimpleMarkdown(
  container,
  text
) {
  const lines =
    text.split("\n");

  lines.forEach(
    (line, lineIndex) => {
      const lineElement =
        document.createElement(
          "span"
        );

      const headingMatch =
        line.match(
          /^#{1,3}\s+(.+)/
        );

      if (headingMatch) {
        const strong =
          document.createElement(
            "strong"
          );

        strong.textContent =
          headingMatch[1];

        lineElement.appendChild(
          strong
        );
      } else {
        appendBoldSegments(
          lineElement,
          line
        );
      }

      container.appendChild(
        lineElement
      );

      if (
        lineIndex <
        lines.length - 1
      ) {
        container.appendChild(
          document.createElement(
            "br"
          )
        );
      }
    }
  );
}

function appendBoldSegments(
  container,
  text
) {
  const pattern =
    /\*\*([^*]+)\*\*/g;

  let cursor = 0;
  let match;

  while (
    (
      match =
        pattern.exec(text)
    ) !== null
  ) {
    container.appendChild(
      document.createTextNode(
        text.slice(
          cursor,
          match.index
        )
      )
    );

    const strong =
      document.createElement(
        "strong"
      );

    strong.textContent =
      match[1];

    container.appendChild(
      strong
    );

    cursor =
      pattern.lastIndex;
  }

  container.appendChild(
    document.createTextNode(
      text.slice(cursor)
    )
  );
}

/* --------------------------------
   Read web citations
-------------------------------- */

function extractSourceLinks(
  annotations
) {
  if (
    !Array.isArray(
      annotations
    )
  ) {
    return [];
  }

  const sources = [];
  const seenUrls =
    new Set();

  annotations.forEach(
    (annotation) => {
      const citation =
        annotation?.url_citation;

      if (
        annotation?.type ===
          "url_citation" &&
        citation?.url &&
        !seenUrls.has(
          citation.url
        )
      ) {
        seenUrls.add(
          citation.url
        );

        let fallbackTitle =
          "Source";

        try {
          fallbackTitle =
            new URL(
              citation.url
            ).hostname;
        } catch (error) {
          console.warn(
            "Invalid source URL returned by the API:",
            citation.url
          );
        }

        sources.push({
          url: citation.url,

          title:
            citation.title ||
            fallbackTitle
        });
      }
    }
  );

  return sources.slice(0, 6);
}

/* --------------------------------
   Typing indicator
-------------------------------- */

function showTypingIndicator() {
  typingRow =
    document.createElement(
      "div"
    );

  typingRow.className =
    "message-row assistant";

  typingRow.setAttribute(
    "aria-label",
    "Beauty Advisor is typing"
  );

  const avatar =
    document.createElement(
      "div"
    );

  avatar.className =
    "message-avatar";

  avatar.setAttribute(
    "aria-hidden",
    "true"
  );

  avatar.textContent = "L";

  const bubble =
    document.createElement(
      "div"
    );

  bubble.className =
    "message-bubble typing-bubble";

  for (
    let index = 0;
    index < 3;
    index += 1
  ) {
    const dot =
      document.createElement(
        "span"
      );

    dot.className =
      "typing-dot";

    dot.setAttribute(
      "aria-hidden",
      "true"
    );

    bubble.appendChild(
      dot
    );
  }

  typingRow.append(
    avatar,
    bubble
  );

  chatWindow.appendChild(
    typingRow
  );

  scrollChatToBottom();
}

function removeTypingIndicator() {
  if (typingRow) {
    typingRow.remove();
    typingRow = null;
  }
}

/* --------------------------------
   Loading state
-------------------------------- */

function setRequestPending(
  isPending,
  isRoutineRequest
) {
  isRequestPending =
    isPending;

  productSearch.disabled =
    isPending;

  categoryFilter.disabled =
    isPending;

  routineGoals.disabled =
    isPending;

  webSearchToggle.disabled =
    isPending;

  rtlToggle.disabled =
    isPending;

  if (isRoutineRequest) {
    generateRoutineBtn
      .querySelector("span")
      .textContent =
        isPending
          ? "Building your routine..."
          : "Generate my routine";
  }

  renderSelectedProducts();

  setChatEnabled(
    routineHasBeenGenerated &&
    !isPending
  );
}

/* --------------------------------
   Enable or disable follow-up chat
-------------------------------- */

function setChatEnabled(
  isEnabled
) {
  userInput.disabled =
    !isEnabled;

  sendBtn.disabled =
    !isEnabled;

  userInput.placeholder =
    isEnabled
      ? "Ask a follow-up about your routine"
      : "Generate a routine to unlock follow-up chat";
}

/* --------------------------------
   Reset chat
-------------------------------- */

function resetChatWindow() {
  chatWindow.innerHTML =
    "";

  chatStatus.textContent =
    "Building routine";

  chatStatus.classList.remove(
    "ready"
  );
}

function scrollChatToBottom() {
  chatWindow.scrollTop =
    chatWindow.scrollHeight;
}

/* --------------------------------
   Selected-product helpers
-------------------------------- */

function getSelectedProducts() {
  return allProducts.filter(
    (product) =>
      selectedProductIds.has(
        product.id
      )
  );
}

function saveSelectedProductIds() {
  localStorage.setItem(
    STORAGE_KEYS.selectedProducts,

    JSON.stringify([
      ...selectedProductIds
    ])
  );
}

function loadSelectedProductIds() {
  try {
    const savedIds =
      JSON.parse(
        localStorage.getItem(
          STORAGE_KEYS.selectedProducts
        ) || "[]"
      );

    if (
      !Array.isArray(
        savedIds
      )
    ) {
      return new Set();
    }

    return new Set(
      savedIds.filter(
        (id) =>
          Number.isInteger(id)
      )
    );
  } catch (error) {
    console.warn(
      "Saved selections could not be loaded:",
      error
    );

    return new Set();
  }
}

function removeMissingSavedIds() {
  const availableIds =
    new Set(
      allProducts.map(
        (product) =>
          product.id
      )
    );

  selectedProductIds =
    new Set(
      [
        ...selectedProductIds
      ].filter(
        (id) =>
          availableIds.has(id)
      )
    );

  saveSelectedProductIds();
}

/* --------------------------------
   RTL LevelUp
-------------------------------- */

function toggleRtlMode() {
  const willUseRtl =
    document.documentElement.dir !==
    "rtl";

  setRtlMode(
    willUseRtl
  );

  localStorage.setItem(
    STORAGE_KEYS.rtlMode,
    String(willUseRtl)
  );
}

function setRtlMode(
  useRtl
) {
  document.documentElement.dir =
    useRtl
      ? "rtl"
      : "ltr";

  document.documentElement.lang =
    useRtl
      ? "ar"
      : "en";

  rtlToggle
    .querySelector("span")
    .textContent =
      useRtl
        ? "LTR mode"
        : "RTL mode";

  rtlToggle.setAttribute(
    "aria-pressed",
    String(useRtl)
  );
}

/* --------------------------------
   Worker URL validation
-------------------------------- */

function validateWorkerUrl() {
  const isHttpsUrl =
    /^https:\/\//i.test(
      WORKER_URL
    );

  if (
    !isHttpsUrl ||
    WORKER_URL.includes(
      "YOUR-"
    )
  ) {
    throw new Error(
      "Setup needed: paste your deployed Cloudflare Worker HTTPS URL into WORKER_URL at the top of script.js."
    );
  }
}

/* --------------------------------
   Error messages
-------------------------------- */

function createFriendlyErrorMessage(
  error
) {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  const lowercaseMessage =
    message.toLowerCase();

  if (
    lowercaseMessage.includes(
      "failed to fetch"
    )
  ) {
    return "I could not reach the Cloudflare Worker. Confirm that the Worker is deployed, the URL is correct, and its CORS setting allows this website.";
  }

  if (
    lowercaseMessage.includes(
      "model"
    ) ||
    lowercaseMessage.includes(
      "web search"
    ) ||
    lowercaseMessage.includes(
      "access"
    )
  ) {
    return `The AI request could not be completed. ${message} Try turning off Live product search, or confirm that your OpenAI account can use the search model.`;
  }

  return `Sorry, I could not complete that request. ${message}`;
}

/* --------------------------------
   Text helpers
-------------------------------- */

function formatCategory(
  category
) {
  return category
    .split(" ")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ");
}

function escapeHtml(
  value
) {
  return String(value)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}