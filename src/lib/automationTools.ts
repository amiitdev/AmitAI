import { Settings } from '../types';
import { ExecuteResult, ToolDef } from '../api/openai';
import * as A from './automation';

/**
 * Action Mode tools for the agent.
 *
 * These are advertised only when the user has turned Action Mode on, and every
 * one of them answers in the same JSON envelope the native engine produces
 * (status / ok / message / error_code / changed / data). The envelope is the
 * whole point: the model can tell "the screen changed" apart from "I asked and
 * nothing happened", which is what keeps it from acting blind.
 *
 * The prompts below are the model's only instruction on how to behave. They are
 * written as rules, not suggestions, because a wrong tap is not a bad answer —
 * it is an action taken on someone's phone.
 */
export const AUTOMATION_TOOL_DEFS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'open_app',
      description:
        'Open an installed app by package name (e.g. com.google.android.youtube). Waits until it is actually in the foreground and then returns what is on screen. Use this instead of tapping a launcher icon.',
      parameters: {
        type: 'object',
        properties: {
          package_name: {
            type: 'string',
            description: 'Android package name, e.g. "com.google.android.youtube". Call list_installed_apps if you do not know it.',
          },
          uri: {
            type: 'string',
            description:
              'Optional deep link to open inside that app, e.g. "https://www.youtube.com/results?search_query=terafitoor". Tried first; if the app does not handle it, its normal launch screen is used.',
          },
        },
        required: ['package_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_foreground_app',
      description:
        'Which app is in front right now, whether its window is readable, and whether it looks sensitive. Use before acting if you are not sure the screen is still where you left it.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_installed_apps',
      description:
        'List launchable apps with their labels and package names. Use when the user names an app and you need its exact package.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Optional words to filter by, e.g. "youtube" or "music".' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_screen_content',
      description:
        'Read the visible text and interactive elements of the current screen (structured, no screenshots). Call this after every state-changing action and before deciding the next step.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'How many interactive elements to return (4-300, default 80).' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_element',
      description:
        'Find an element by its visible text or content description without tapping it. Returns bounds and whether it is clickable/editable. Use this to verify a control exists before tapping.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Visible label text, e.g. "Search".' },
          content_description: { type: 'string', description: 'Accessibility label, e.g. "Search YouTube".' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_clickable_elements',
      description:
        'List what can actually be tapped on this screen, in reading order. Use when text matching failed, or to pick the right control.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum elements (1-120, default 40).' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'tap_element',
      description:
        'Tap the element that matches this text or content description. The result says whether the screen actually changed — if it did not, do NOT repeat the same tap, read the screen again.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Visible label of the element to tap.' },
          content_description: { type: 'string', description: 'Accessibility label of the element to tap.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'type_text',
      description:
        'Type into the focused (or first) text field on screen. Never use this for passwords, OTPs, PINs, card numbers or any authentication field — the phone refuses those anyway. Set submit=true to press the keyboard action / search button afterwards.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The exact text to enter.' },
          submit: {
            type: 'boolean',
            description: 'Press Enter / the search key after typing (default false).',
          },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scroll_screen',
      description:
        'Scroll the main scrollable area. The result says whether any visible content moved; if not you are probably at the end.',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Direction of travel through the content.' },
        },
        required: ['direction'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'press_back',
      description:
        'Press the system Back button. The result says whether the screen changed — at an app root it often does nothing.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_automation_status',
      description:
        'Whether Action Mode is on, whether Android accessibility is granted and bound, what is running, how many actions have completed, and why automation last stopped.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'stop_automation',
      description:
        'Stop automation immediately and release the screen. Use when the user asks to stop, when the screen is not what you expected, or when a task is complete and you want to release control.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_user_confirmation',
      description:
        'Ask the user to approve one specific action and wait for their answer. You MUST call this before sending a message or email, posting, deleting/moving/renaming files, uninstalling, logging out, or anything financial. Do not perform the action if the answer is denied or times out.',
      parameters: {
        type: 'object',
        properties: {
          action_description: {
            type: 'string',
            description: 'One plain sentence describing exactly what will happen, e.g. "Send the message “running late” to Riya on WhatsApp".',
          },
          timeout_seconds: {
            type: 'number',
            description: 'How long to wait for the answer (10-180, default 90).',
          },
        },
        required: ['action_description'],
      },
    },
  },
];

/** User-facing progress text for the tool chip. */
export function automationLabel(name: string, args: any): string {
  switch (name) {
    case 'open_app':
      return `Opening ${String(args?.package_name ?? 'app').split('.').pop()}`;
    case 'get_foreground_app':
      return 'Checking the foreground app';
    case 'list_installed_apps':
      return 'Listing apps';
    case 'get_screen_content':
      return 'Reading the screen';
    case 'find_element':
      return `Looking for “${String(args?.text ?? args?.content_description ?? '').slice(0, 24)}”`;
    case 'get_clickable_elements':
      return 'Listing tappable elements';
    case 'tap_element':
      return `Tapping “${String(args?.text ?? args?.content_description ?? '').slice(0, 24)}”`;
    case 'type_text':
      return `Typing ${String(args?.text ?? '').length} characters`;
    case 'scroll_screen':
      return `Scrolling ${String(args?.direction ?? '')}`;
    case 'press_back':
      return 'Going back';
    case 'get_automation_status':
      return 'Checking Action Mode';
    case 'stop_automation':
      return 'Stopping automation';
    case 'request_user_confirmation':
      return 'Waiting for your confirmation';
    default:
      return name;
  }
}

const PACKAGE_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/;

const fail = (action: string, message: string, code = 'invalid_argument'): ExecuteResult => ({
  content: JSON.stringify({
    status: 'failed',
    ok: false,
    action,
    message,
    error_code: code,
    changed: null,
    duration_ms: 0,
    data: {},
  }),
});

const toResult = (r: A.AutomationEnvelope): ExecuteResult => ({
  content: JSON.stringify(r),
});

/**
 * One tool call. Validation happens here as well as in Kotlin: a model that
 * sends `direction: "sideways"` or a half-written package name gets a clear
 * error instead of an ambiguous native failure.
 */
export async function executeAutomationTool(name: string, args: any): Promise<ExecuteResult> {
  switch (name) {
    case 'open_app': {
      const pkg = String(args?.package_name ?? '').trim();
      if (!PACKAGE_RE.test(pkg)) {
        return fail('open_app', `“${pkg}” is not an Android package name. Use list_installed_apps to find it.`);
      }
      const uri = args?.uri == null ? undefined : String(args.uri).trim();
      if (uri && !/^[a-z][a-z0-9+.-]*:\/\//i.test(uri)) {
        return fail('open_app', 'The deep link must be an absolute URI like https://…');
      }
      return toResult(await A.openApp(pkg, uri));
    }

    case 'get_foreground_app':
      return toResult(await A.foregroundApp());

    case 'list_installed_apps': {
      const q = args?.query == null ? undefined : String(args.query).trim();
      return toResult(await A.listInstalledApps(q));
    }

    case 'get_screen_content': {
      const limit = Number.isFinite(Number(args?.limit)) ? Number(args.limit) : 80;
      return toResult(await A.screenContent(Math.min(300, Math.max(4, limit))));
    }

    case 'find_element': {
      const text = args?.text == null ? undefined : String(args.text).trim();
      const desc =
        args?.content_description == null ? undefined : String(args.content_description).trim();
      if (!text && !desc) {
        return fail('find_element', 'Give a text or content_description to look for.');
      }
      return toResult(await A.findElement(text, desc));
    }

    case 'get_clickable_elements': {
      const limit = Number.isFinite(Number(args?.limit)) ? Number(args.limit) : 40;
      return toResult(await A.clickableElements(Math.min(120, Math.max(1, limit))));
    }

    case 'tap_element': {
      const text = args?.text == null ? undefined : String(args.text).trim();
      const desc =
        args?.content_description == null ? undefined : String(args.content_description).trim();
      if (!text && !desc) {
        return fail('tap_element', 'Give a text or content_description to tap.');
      }
      return toResult(await A.tapElement(text, desc));
    }

    case 'type_text': {
      const text = args?.text == null ? '' : String(args.text);
      if (!text) return fail('type_text', 'There is no text to type.');
      if (text.length > 1200) {
        return fail('type_text', `Too much text for one field (${text.length} characters, limit 1200).`);
      }
      return toResult(await A.typeText(text, !!args?.submit));
    }

    case 'scroll_screen': {
      const d = String(args?.direction ?? '').toLowerCase();
      if (!['up', 'down', 'left', 'right'].includes(d)) {
        return fail('scroll_screen', 'Direction must be up, down, left or right.');
      }
      return toResult(await A.scrollScreen(d as 'up' | 'down' | 'left' | 'right'));
    }

    case 'press_back':
      return toResult(await A.pressBack());

    case 'get_automation_status': {
      const status = await A.getAutomationStatus();
      if (!status) return fail('get_automation_status', 'Action Mode is not available in this build.', 'not_available');
      return {
        content: JSON.stringify({
          status: 'success',
          ok: true,
          action: 'get_automation_status',
          message: status.hint ?? 'Automation status read.',
          error_code: null,
          changed: null,
          duration_ms: 0,
          at: Date.now(),
          data: status,
        }),
      };
    }

    case 'stop_automation':
      return toResult(await A.stopAutomation());

    case 'request_user_confirmation': {
      const description =
        args?.action_description == null ? '' : String(args.action_description).trim();
      if (description.length < 4) {
        return fail(
          'request_user_confirmation',
          'Say what the user is approving, e.g. “send the message to Riya”.',
        );
      }
      const secs = Number(args?.timeout_seconds);
      const timeout = Number.isFinite(secs) && secs > 0
        ? Math.min(180, Math.max(10, secs)) * 1000
        : 90_000;
      return toResult(await A.requestUserConfirmation(description.slice(0, 240), timeout));
    }

    default:
      return fail(name, `Unknown automation tool ${name}`, 'unknown_tool');
  }
}

/** True when the model is allowed to see the automation tools at all. */
export const automationToolsEnabled = (settings: Settings): boolean =>
  A.hasAutomation && !!settings.actionMode && !!settings.toolsAutomation;

/**
 * Appended to the system prompt only while Action Mode is on.
 *
 * Everything here exists because of one failure mode: a model that taps, taps
 * and taps without looking. The rules make looking the default.
 */
export const AUTOMATION_SYSTEM_PROMPT = `
ACTION MODE (you can control this Android phone).
These rules are mandatory:
1. Start apps with open_app, never by tapping a launcher icon. Use a deep link (uri) when you know one.
2. After EVERY action that can change the screen, call get_screen_content (or read the \`screen\`/result data) and check that it is the screen you expected. Do not act twice without looking.
3. If a result has ok=false, do not repeat the same action. Read the screen again, choose a different element, or tell the user what is blocking you.
4. Before sending a message or email, posting, deleting/moving/renaming files, uninstalling, logging out, paying or buying anything: call request_user_confirmation and wait. If the user declines or it times out, do not do it.
5. Never type passwords, OTPs, PINs, card numbers or recovery codes; never try to get past a login, permission dialog or payment screen. If the phone reports a sensitive screen, stop and hand it back to the user.
6. Prefer text and content descriptions of visible elements; never invent coordinates.
7. When the task is done, call stop_automation and report exactly what happened — including a step that failed.
8. Keep replies short while acting: say what you are doing, then do it.
`.trim();
