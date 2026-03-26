import type { MailFolder, MailItem } from "./mail-types";

export const demoFolders: MailFolder[] = [
  { id: "INBOX", label: "Inbox", count: 24, unreadCount: 4 },
  { id: "Sent", label: "Sent", count: 18, unreadCount: 0 },
  { id: "Drafts", label: "Drafts", count: 3, unreadCount: 3 },
  { id: "Archive", label: "Archive", count: 102, unreadCount: 0 },
  { id: "Spam", label: "Spam", count: 7, unreadCount: 7 },
  { id: "Trash", label: "Trash", count: 5, unreadCount: 0 },
];

export const demoMessages: MailItem[] = [
  {
    id: "msg-001",
    sender: "Alex Rivera",
    subject: "Q2 planning — agenda attached",
    preview: "Hi team, I've attached the agenda for our Q2 planning session. Please review before Thursday.",
    timestamp: "10:42 AM",
    unread: true,
    starred: true,
  },
  {
    id: "msg-002",
    sender: "GitHub",
    subject: "Your pull request was merged",
    preview: "jonathjan0397/mailframe — PR #4 'Add base theme tokens' was merged by a collaborator.",
    timestamp: "9:15 AM",
    unread: true,
  },
  {
    id: "msg-003",
    sender: "Sarah Chen",
    subject: "Re: Design feedback",
    preview: "The new layout looks great. One suggestion — the sidebar feels a bit wide on smaller screens.",
    timestamp: "Yesterday",
    unread: false,
  },
  {
    id: "msg-004",
    sender: "Netlify",
    subject: "Deploy succeeded: mailframe",
    preview: "Your site mailframe.netlify.app deployed successfully at 11:03 PM.",
    timestamp: "Yesterday",
    unread: false,
    starred: true,
  },
  {
    id: "msg-005",
    sender: "Marcus Webb",
    subject: "Invoice #1042 — due March 31",
    preview: "Please find attached invoice #1042 for services rendered in March. Payment due March 31.",
    timestamp: "Mar 24",
    unread: false,
  },
  {
    id: "msg-006",
    sender: "Jordan Kim",
    subject: "Coffee catch-up?",
    preview: "Hey, been a while! Would love to catch up sometime this week if you're free.",
    timestamp: "Mar 23",
    unread: false,
  },
  {
    id: "msg-007",
    sender: "Vercel",
    subject: "Your trial ends in 3 days",
    preview: "Your Vercel Pro trial ends on March 29. Upgrade to keep your projects running.",
    timestamp: "Mar 22",
    unread: true,
  },
];

export const demoMessageBodies: Record<string, string[]> = {
  "msg-001": [
    "Hi team,",
    "I've attached the agenda for our Q2 planning session scheduled for Thursday at 2pm. Please review the items before the meeting so we can move efficiently.",
    "Key topics: roadmap priorities, resource allocation, and the new tooling proposal from engineering.",
    "Let me know if you want to add anything.",
    "— Alex",
  ],
  "msg-002": [
    "Pull request #4 'Add base theme tokens' was merged into main.",
    "Merged by: collaborator | Branch: feat/base-theme → main",
    "View the pull request on GitHub for details.",
  ],
  "msg-003": [
    "The new layout looks great overall — solid progress.",
    "One suggestion: the sidebar feels a bit wide on smaller screens. Have you considered a collapsible nav for below 768px? Could give the message list more breathing room.",
    "Otherwise ship it.",
    "— Sarah",
  ],
  "msg-004": [
    "Your site mailframe.netlify.app was deployed successfully.",
    "Deploy time: 11:03 PM | Build time: 34s | Status: Published",
  ],
  "msg-005": [
    "Hi,",
    "Please find attached invoice #1042 for services rendered in March.",
    "Amount due: $1,200.00 | Due date: March 31, 2026 | Payment method: Bank transfer or PayPal",
    "Thank you for your business.",
    "— Marcus Webb",
  ],
  "msg-006": [
    "Hey!",
    "Been a while since we caught up. Would love to grab coffee sometime this week if you're free — maybe Wednesday or Thursday afternoon?",
    "Let me know what works.",
    "— Jordan",
  ],
  "msg-007": [
    "Your Vercel Pro trial ends in 3 days on March 29.",
    "To keep your projects running without interruption, upgrade your account before the trial expires.",
    "Questions? Reply to this email or visit the billing page.",
  ],
};
