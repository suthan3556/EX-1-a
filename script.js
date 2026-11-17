const menuButton = document.getElementById('menuBtn');
const nav = document.getElementById('navLinks');
const contactForm = document.getElementById('contactForm');
const formNote = document.getElementById('formNote');

if (menuButton && nav) {
  menuButton.addEventListener('click', () => {
    nav.classList.toggle('show');
  });

  nav.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => nav.classList.remove('show'));
  });
}

if (contactForm && formNote) {
  contactForm.addEventListener('submit', async event => {
    event.preventDefault();
    const submitButton = contactForm.querySelector('button[type="submit"]');
    const formData = new FormData(contactForm);
    const message = {
      name: formData.get('name'),
      email: formData.get('email'),
      message: formData.get('message')
    };

    submitButton.disabled = true;
    formNote.textContent = 'Sending...';

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Unable to send your message.');
      }

      formNote.textContent = result.message;
      contactForm.reset();
    } catch (error) {
      formNote.textContent = error.message || 'Unable to send your message. Please try again.';
    } finally {
      submitButton.disabled = false;
    }
  });
}
