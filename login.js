document.addEventListener('DOMContentLoaded', () => {
    const SUPABASE_URL = 'https://fpulgnhtngvqdikbdkgv.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwdWxnbmh0bmd2cWRpa2Jka2d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIyMzcwNTAsImV4cCI6MjA2NzgxMzA1MH0.0e8Cs9bDKTdI9RLa8o3UNBh_ARGh6AlYO9dm16TYPdw';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const loginForm = document.getElementById('login-form');
    const loginMessage = document.getElementById('login-message');
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    const forgotPasswordModal = new bootstrap.Modal(document.getElementById('forgotPasswordModal'));
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    const forgotPasswordMessage = document.getElementById('forgot-password-message');

    // Redirect if a session already exists
    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            window.location.replace('/app.html');
        }
    });

    // Login form submission handler
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        loginMessage.textContent = 'Logging in...';
        loginMessage.className = 'text-info mt-3 text-center';

        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            loginMessage.textContent = error.message;
            loginMessage.className = 'text-danger mt-3 text-center';
        } else if (data.user) {
            window.location.href = 'app.html';
        }
    });

    // Forgot password link handler
    forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        forgotPasswordMessage.textContent = '';
        forgotPasswordForm.reset();
        forgotPasswordModal.show();
    });

    // Forgot password form submission handler
    forgotPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('forgot-email').value;
        forgotPasswordMessage.textContent = 'Sending reset email...';
        forgotPasswordMessage.className = 'text-info mt-2';

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
             redirectTo: window.location.origin, // Redirect back to your site after password reset
        });

        if (error) {
            forgotPasswordMessage.textContent = error.message;
            forgotPasswordMessage.className = 'text-danger mt-2';
        } else {
            forgotPasswordMessage.textContent = 'Password reset email sent! Please check your inbox.';
            forgotPasswordMessage.className = 'text-success mt-2';
        }
    });
});