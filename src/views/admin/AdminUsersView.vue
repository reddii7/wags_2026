<script setup>
import { computed, onMounted, ref } from "vue";
import { useSession } from "../../composables/useSession";
import { supabase, SUPABASE_URL } from "../../lib/supabase";
import { triggerHapticFeedback } from "../../utils/haptics";

const leagueOptions = ["League 1", "League 2", "League 3", "League 4"];
const roleOptions = ["player", "committee", "admin"];

const { loading: sessionLoading, isAdmin, role, profile } = useSession();

const loading = ref(true);
const saving = ref(false);
const users = ref([]);
const search = ref("");
const error = ref("");
const createMessage = ref("");
const editMessage = ref("");
const selectedUserId = ref(null);
const createForm = ref({
  full_name: "",
  email: "",
  password: "",
  current_handicap: "",
  league_name: leagueOptions[0],
  role: "player",
});
const editForm = ref({
  id: "",
  full_name: "",
  email: "",
  current_handicap: "",
  league_name: leagueOptions[0],
  role: "player",
});

const canManageUsers = computed(() => role.value === "admin");

const filteredUsers = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) return users.value;

  return users.value.filter((user) => {
    const name = String(user.full_name || "").toLowerCase();
    const email = String(user.email || "").toLowerCase();
    return name.includes(query) || email.includes(query);
  });
});

const selectedUser = computed(
  () => users.value.find((user) => user.id === selectedUserId.value) || null,
);

const userSummary = computed(() => ({
  total: users.value.length,
  admins: users.value.filter((user) => user.role === "admin").length,
  committee: users.value.filter((user) => user.role === "committee").length,
}));

const normalizeText = (value) => value.trim().replace(/\s+/g, " ");

const parseHandicapValue = (value) => {
  const normalized = String(value).trim().replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const getAccessToken = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || null;
};

const resetCreateForm = () => {
  createForm.value = {
    full_name: "",
    email: "",
    password: "",
    current_handicap: "",
    league_name: leagueOptions[0],
    role: "player",
  };
};

const loadUsers = async () => {
  loading.value = true;
  error.value = "";

  const { data, error: queryError } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, current_handicap, league_name")
    .order("full_name");

  if (queryError) {
    error.value = queryError.message || "Unable to load users.";
    users.value = [];
    loading.value = false;
    return;
  }

  users.value = data || [];

  if (
    !selectedUserId.value ||
    !users.value.some((user) => user.id === selectedUserId.value)
  ) {
    selectedUserId.value = users.value[0]?.id || null;
  }

  if (selectedUser.value) {
    editForm.value = {
      id: selectedUser.value.id,
      full_name: selectedUser.value.full_name || "",
      email: selectedUser.value.email || "",
      current_handicap: selectedUser.value.current_handicap ?? "",
      league_name: selectedUser.value.league_name || leagueOptions[0],
      role: selectedUser.value.role || "player",
    };
  }

  loading.value = false;
};

const selectUser = (user) => {
  triggerHapticFeedback();
  selectedUserId.value = user.id;
  editMessage.value = "";
  editForm.value = {
    id: user.id,
    full_name: user.full_name || "",
    email: user.email || "",
    current_handicap: user.current_handicap ?? "",
    league_name: user.league_name || leagueOptions[0],
    role: user.role || "player",
  };
};

const createUser = async () => {
  if (!canManageUsers.value) return;

  triggerHapticFeedback();

  createMessage.value = "";
  error.value = "";

  const fullName = normalizeText(createForm.value.full_name);
  const email = normalizeText(createForm.value.email).toLowerCase();
  const password = String(createForm.value.password || "").trim();
  const currentHandicap = parseHandicapValue(createForm.value.current_handicap);

  if (
    !fullName ||
    !email ||
    !password ||
    !createForm.value.league_name ||
    !createForm.value.role
  ) {
    createMessage.value = "Complete every field before creating a player.";
    return;
  }

  if (Number.isNaN(currentHandicap)) {
    createMessage.value = "Starting handicap must be a valid number.";
    return;
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    createMessage.value = "Session expired. Sign in again.";
    return;
  }

  saving.value = true;

  const payloads = [
    {
      full_name: fullName,
      email,
      password,
      role: createForm.value.role,
      starting_handicap: currentHandicap,
      league_name: createForm.value.league_name,
    },
    {
      full_name: fullName,
      email,
      password,
      role: createForm.value.role,
      current_handicap: currentHandicap,
      league_name: createForm.value.league_name,
    },
  ];

  let result = { error: "Failed to create player." };
  let response;

  for (const payload of payloads) {
    response = await fetch(`${SUPABASE_URL}/functions/v1/create-player`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    result = await response
      .json()
      .catch(() => ({ error: "Invalid server response." }));
    if (response.ok && !result.error) break;
    if (result.error !== "Invalid request body") break;
  }

  saving.value = false;

  if (response?.ok && !result.error) {
    createMessage.value = "Player created.";
    resetCreateForm();
    await loadUsers();
    return;
  }

  createMessage.value = result.error || "Failed to create player.";
};

const saveUser = async () => {
  if (!canManageUsers.value || !editForm.value.id) return;

  triggerHapticFeedback();

  editMessage.value = "";
  error.value = "";

  const currentHandicap = parseHandicapValue(editForm.value.current_handicap);
  if (
    !editForm.value.full_name.trim() ||
    !editForm.value.email.trim() ||
    Number.isNaN(currentHandicap)
  ) {
    editMessage.value = "Enter a valid name, email and handicap.";
    return;
  }

  saving.value = true;

  const { error: queryError } = await supabase
    .from("profiles")
    .update({
      full_name: normalizeText(editForm.value.full_name),
      email: normalizeText(editForm.value.email).toLowerCase(),
      role: editForm.value.role,
      current_handicap: currentHandicap,
      league_name: editForm.value.league_name,
    })
    .eq("id", editForm.value.id);

  saving.value = false;

  if (queryError) {
    editMessage.value = queryError.message;
    return;
  }

  editMessage.value = "User updated.";
  await loadUsers();
};

const deleteUser = async () => {
  if (!canManageUsers.value || !selectedUser.value) return;

  triggerHapticFeedback();

  error.value = "";
  editMessage.value = "";

  const accessToken = await getAccessToken();
  if (!accessToken) {
    editMessage.value = "Session expired. Sign in again.";
    return;
  }

  saving.value = true;

  const response = await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ user_id: selectedUser.value.id }),
  });

  const result = await response.json().catch(() => ({}));
  saving.value = false;

  if (!response.ok) {
    editMessage.value =
      result.error || response.statusText || "Failed to delete user.";
    return;
  }

  editMessage.value = "User deleted.";
  selectedUserId.value = null;
  await loadUsers();
};

onMounted(async () => {
  if (!isAdmin.value) {
    loading.value = false;
    return;
  }

  await loadUsers();
});
</script>

<template>
  <section class="admin-page">
    <div>
      <h1 class="admin-page-title">Users</h1>
      <p class="admin-page-copy">
        Create players, review membership details, and maintain handicap, role,
        and league assignments.
      </p>
    </div>

    <section v-if="sessionLoading" class="content-panel">
      <p class="empty-state">Checking access…</p>
    </section>

    <section v-else-if="!isAdmin" class="content-panel compact-panel">
      <div class="panel-heading">
        <h3>Restricted</h3>
        <span>Admin access only</span>
      </div>
      <p class="empty-state">
        Sign in with a committee or admin account to manage users.
      </p>
    </section>

    <template v-else>
      <div class="admin-status-strip">
        <div class="admin-status-item">
          <span class="stat-label">Members</span>
          <strong>{{ userSummary.total }}</strong>
        </div>
        <div class="admin-status-item">
          <span class="stat-label">Admins</span>
          <strong>{{ userSummary.admins }}</strong>
        </div>
        <div class="admin-status-item">
          <span class="stat-label">Committee</span>
          <strong>{{ userSummary.committee }}</strong>
        </div>
        <div class="admin-status-item">
          <span class="stat-label">Signed in</span>
          <strong>{{ profile?.full_name || "Admin" }}</strong>
        </div>
      </div>

      <div class="admin-grid">
        <div class="admin-stack">
          <section class="content-panel auth-panel">
            <div class="panel-heading">
              <h3>Create player</h3>
              <span>{{ canManageUsers ? "Admin only" : "Read only" }}</span>
            </div>

            <div class="admin-form-grid">
              <div class="admin-form-grid--wide">
                <label class="field-label" for="user-create-name">Name</label>
                <input
                  id="user-create-name"
                  v-model="createForm.full_name"
                  class="quiet-input"
                  type="text"
                  :disabled="!canManageUsers || saving"
                />
              </div>

              <div class="admin-form-grid--wide">
                <label class="field-label" for="user-create-email">Email</label>
                <input
                  id="user-create-email"
                  v-model="createForm.email"
                  class="quiet-input"
                  type="email"
                  :disabled="!canManageUsers || saving"
                />
              </div>

              <div>
                <label class="field-label" for="user-create-password"
                  >Password</label
                >
                <input
                  id="user-create-password"
                  v-model="createForm.password"
                  class="quiet-input"
                  type="password"
                  :disabled="!canManageUsers || saving"
                />
              </div>

              <div>
                <label class="field-label" for="user-create-handicap"
                  >Starting handicap</label
                >
                <input
                  id="user-create-handicap"
                  v-model="createForm.current_handicap"
                  class="quiet-input"
                  type="text"
                  :disabled="!canManageUsers || saving"
                />
              </div>

              <div>
                <label class="field-label" for="user-create-league"
                  >League</label
                >
                <select
                  id="user-create-league"
                  v-model="createForm.league_name"
                  class="quiet-select"
                  :disabled="!canManageUsers || saving"
                >
                  <option
                    v-for="league in leagueOptions"
                    :key="league"
                    :value="league"
                  >
                    {{ league }}
                  </option>
                </select>
              </div>

              <div>
                <label class="field-label" for="user-create-role">Role</label>
                <select
                  id="user-create-role"
                  v-model="createForm.role"
                  class="quiet-select"
                  :disabled="!canManageUsers || saving"
                >
                  <option
                    v-for="roleOption in roleOptions"
                    :key="roleOption"
                    :value="roleOption"
                  >
                    {{ roleOption }}
                  </option>
                </select>
              </div>
            </div>

            <div class="admin-actions">
              <button
                class="quiet-button quiet-button--strong"
                type="button"
                :disabled="!canManageUsers || saving"
                @click="createUser"
              >
                {{ saving ? "Saving…" : "Create player" }}
              </button>
            </div>

            <p v-if="createMessage" class="empty-state">{{ createMessage }}</p>
          </section>

          <section class="content-panel auth-panel">
            <div class="panel-heading">
              <h3>Edit member</h3>
              <span>{{
                selectedUser ? selectedUser.full_name : "Select from list"
              }}</span>
            </div>

            <template v-if="selectedUser">
              <div class="admin-form-grid">
                <div class="admin-form-grid--wide">
                  <label class="field-label" for="user-edit-name">Name</label>
                  <input
                    id="user-edit-name"
                    v-model="editForm.full_name"
                    class="quiet-input"
                    type="text"
                    :disabled="!canManageUsers || saving"
                  />
                </div>

                <div class="admin-form-grid--wide">
                  <label class="field-label" for="user-edit-email">Email</label>
                  <input
                    id="user-edit-email"
                    v-model="editForm.email"
                    class="quiet-input"
                    type="email"
                    :disabled="!canManageUsers || saving"
                  />
                </div>

                <div>
                  <label class="field-label" for="user-edit-handicap"
                    >Current handicap</label
                  >
                  <input
                    id="user-edit-handicap"
                    v-model="editForm.current_handicap"
                    class="quiet-input"
                    type="text"
                    :disabled="!canManageUsers || saving"
                  />
                </div>

                <div>
                  <label class="field-label" for="user-edit-role">Role</label>
                  <select
                    id="user-edit-role"
                    v-model="editForm.role"
                    class="quiet-select"
                    :disabled="!canManageUsers || saving"
                  >
                    <option
                      v-for="roleOption in roleOptions"
                      :key="roleOption"
                      :value="roleOption"
                    >
                      {{ roleOption }}
                    </option>
                  </select>
                </div>

                <div class="admin-form-grid--wide">
                  <label class="field-label" for="user-edit-league"
                    >League</label
                  >
                  <select
                    id="user-edit-league"
                    v-model="editForm.league_name"
                    class="quiet-select"
                    :disabled="!canManageUsers || saving"
                  >
                    <option
                      v-for="league in leagueOptions"
                      :key="league"
                      :value="league"
                    >
                      {{ league }}
                    </option>
                  </select>
                </div>
              </div>

              <div class="admin-actions">
                <button
                  class="quiet-button quiet-button--strong"
                  type="button"
                  :disabled="!canManageUsers || saving"
                  @click="saveUser"
                >
                  {{ saving ? "Saving…" : "Save member" }}
                </button>
                <button
                  class="quiet-button quiet-button--ghost quiet-button--danger"
                  type="button"
                  :disabled="!canManageUsers || saving"
                  @click="deleteUser"
                >
                  Delete member
                </button>
              </div>
            </template>

            <p v-else class="empty-state">
              Select a user from the list to edit their details.
            </p>
            <p v-if="editMessage" class="empty-state">{{ editMessage }}</p>
            <p v-if="error" class="empty-state">{{ error }}</p>
          </section>
        </div>

        <section class="content-panel">
          <div class="panel-heading">
            <h3>Member list</h3>
            <span>{{ filteredUsers.length }} shown</span>
          </div>

          <label class="field-label" for="user-search">Search</label>
          <input
            id="user-search"
            v-model="search"
            class="quiet-input"
            type="search"
            placeholder="Search by name or email"
          />

          <p v-if="loading" class="empty-state">Loading users…</p>
          <div v-else class="admin-user-list">
            <div
              v-for="user in filteredUsers"
              :key="user.id"
              class="admin-user-row"
              :class="{ active: selectedUserId === user.id }"
            >
              <button
                class="admin-user-button"
                type="button"
                @click="selectUser(user)"
              >
                <strong>{{ user.full_name }}</strong>
                <p class="admin-user-meta">{{ user.email }}</p>
              </button>
              <div class="admin-user-summary">
                <span class="admin-tag admin-tag--strong">{{ user.role }}</span>
                <span class="admin-tag">{{
                  user.league_name || "No league"
                }}</span>
                <span class="admin-tag">{{
                  user.current_handicap ?? "—"
                }}</span>
              </div>
            </div>
            <p v-if="!filteredUsers.length" class="empty-state">
              No users match the current search.
            </p>
          </div>
        </section>
      </div>
    </template>
  </section>
</template>
