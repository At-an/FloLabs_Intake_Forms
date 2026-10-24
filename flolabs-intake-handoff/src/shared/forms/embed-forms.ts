import { z } from 'zod';
import { CONTACT_US_FORM } from '../config/embed-forms';

// One Zod schema per embedded form (CLAUDE.md rule 4), shared by the browser and the server.

const { limits } = CONTACT_US_FORM;

const requiredText = (max: number, message: string) =>
  z.string(message).trim().min(1, message).max(max, `Use ${max} characters or fewer.`);

const email = z
  .string('Enter your email address.')
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email address.')
  .max(limits.email, 'This email address is too long.')
  .pipe(z.email('Enter a valid email address, like name@example.com.'));

const submissionKey = z.uuid('This form could not be sent. Please reload the page and try again.');

export const contactUsSchema = z.object({
  submissionKey,
  firstName: requiredText(limits.name, 'Enter your first name.'),
  lastName: requiredText(limits.name, 'Enter your last name.'),
  email,
  subject: requiredText(limits.subject, 'Enter a subject.'),
  message: requiredText(limits.message, 'Tell us how we can help.'),
});

export type ContactUsInput = z.input<typeof contactUsSchema>;
export type ContactUsData = z.output<typeof contactUsSchema>;

export const newsletterSchema = z.object({ submissionKey, email });

export type NewsletterInput = z.input<typeof newsletterSchema>;
export type NewsletterData = z.output<typeof newsletterSchema>;
