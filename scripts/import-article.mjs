import { access, copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const blogDirectory = path.join(projectRoot, "src", "content", "blog");
const args = process.argv.slice(2);
const options = {
  dryRun: false,
  pinned: false,
  draft: false,
};
let sourceArgument;

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--dry-run") {
    options.dryRun = true;
  } else if (argument === "--pinned") {
    options.pinned = true;
  } else if (argument === "--draft") {
    options.draft = true;
  } else if (["--slug", "--category", "--article-description"].includes(argument)) {
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} 后需要一个值。`);
    }
    const optionName = argument === "--article-description" ? "description" : argument.slice(2);
    options[optionName] = value;
    index += 1;
  } else if (argument === "--help") {
    console.log('用法: npm run article:import -- "temp/文章目录/文章.md" [--dry-run] [--slug slug] [--category 分类] [--article-description 摘要] [--pinned] [--draft]');
    process.exit(0);
  } else if (argument.startsWith("--")) {
    throw new Error(`不支持的参数：${argument}`);
  } else if (sourceArgument) {
    throw new Error("一次只能导入一篇 Markdown 文章。若路径含中文弯引号，请在 PowerShell 中用 ASCII 单引号括住完整路径。");
  } else {
    sourceArgument = argument;
  }
}

if (!sourceArgument) {
  throw new Error('请提供 Markdown 文件路径，例如：npm run article:import -- "temp/文章目录/1.md"');
}

function readFrontmatterField(frontmatter, field) {
  const match = frontmatter.match(new RegExp(`^${field}:[\\t ]*(.*)$`, "m"));
  if (!match) return undefined;

  const value = match[1].trim();
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  return value || undefined;
}

function setFrontmatterField(frontmatter, field, value, override = false) {
  const line = `${field}: ${value}`;
  const fieldPattern = new RegExp(`^${field}:[^\\r\\n]*$`, "m");
  if (fieldPattern.test(frontmatter)) {
    return override ? frontmatter.replace(fieldPattern, line) : frontmatter;
  }
  return `${frontmatter.trimEnd()}\n${line}`;
}

function quoteYaml(value) {
  return JSON.stringify(value);
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function getToday() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function inferDescription(body, fallback) {
  const paragraph = body
    .split(/\r?\n\s*\r?\n/)
    .map((part) => part.trim())
    .find((part) => part && !/^#{1,6}\s|^```|^>\s|^---/.test(part));

  if (!paragraph) return fallback;
  const plainText = paragraph
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plainText.length > 180 ? `${plainText.slice(0, 177).trimEnd()}...` : plainText;
}

function removeDuplicateTitleHeading(body, title) {
  const lines = body.split(/\r?\n/);
  const firstContentLine = lines.findIndex((line) => line.trim());
  if (firstContentLine < 0) return body;

  const heading = lines[firstContentLine].match(/^#\s+(.+?)\s*#*\s*$/);
  if (heading?.[1].trim() === title.trim()) {
    lines.splice(firstContentLine, 1);
    while (lines[firstContentLine] === "") lines.splice(firstContentLine, 1);
  }
  return lines.join("\n");
}

function preserveLineBreaks(markdown) {
  const lines = markdown.split(/\r?\n/);
  let fence;

  return lines.map((line, index) => {
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (
        fenceMatch
        && fenceMatch[1][0] === fence.character
        && fenceMatch[1].length >= fence.length
        && /^[`~]*[\t ]*$/.test(line.slice(fenceMatch[0].length))
      ) {
        fence = undefined;
      }
      return line;
    }

    if (fenceMatch) {
      fence = { character: fenceMatch[1][0], length: fenceMatch[1].length };
      return line;
    }

    if (line.trim() && lines[index + 1]?.trim()) {
      return `${line.trimEnd()}  `;
    }
    return line;
  }).join("\n");
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeTitle(title) {
  return title.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

async function findArticlesByTitle(title) {
  const entries = await readdir(blogDirectory, { withFileTypes: true });
  const normalizedTitle = normalizeTitle(title);
  const matches = [];

  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md") continue;
    const filePath = path.join(blogDirectory, entry.name);
    const content = await readFile(filePath, "utf8");
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? "";
    const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
    const existingTitle = readFrontmatterField(frontmatter, "title")
      || body.match(/^\s*#\s+(.+?)\s*#*\s*$/m)?.[1]?.trim();

    if (existingTitle && normalizeTitle(existingTitle) === normalizedTitle) {
      matches.push(filePath);
    }
  }

  return matches;
}

async function main() {
  const sourcePath = path.resolve(projectRoot, sourceArgument);
  if (path.extname(sourcePath).toLowerCase() !== ".md") {
    throw new Error("来源文件必须是 .md Markdown 文件。");
  }

  const sourceDirectory = path.dirname(sourcePath);
  const source = (await readFile(sourcePath, "utf8")).replaceAll("’", "\u0060");
  const frontmatterMatch = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  let frontmatter = frontmatterMatch?.[1] ?? "";
  let body = frontmatterMatch ? source.slice(frontmatterMatch[0].length) : source;

  const firstHeading = body.match(/^\s*#\s+(.+?)\s*#*\s*$/m)?.[1]?.trim();
  const folderTitle = path.basename(sourceDirectory).replace(/^\d+[\s._-]*/, "").trim();
  const title = readFrontmatterField(frontmatter, "title") || firstHeading || folderTitle;
  if (!title) throw new Error("无法确定文章标题；请在 Markdown 中添加一级标题（# 标题）。");

  const requestedSlug = options.slug || slugify(title);
  if (!requestedSlug || !/^[\p{L}\p{N}-]+$/u.test(requestedSlug)) {
    throw new Error("slug 只能包含中文、字母、数字和连字符；请通过 --slug 指定。");
  }

  const titleMatches = await findArticlesByTitle(title);
  let destinationPath;
  if (titleMatches.length === 1) {
    destinationPath = titleMatches[0];
  } else if (titleMatches.length > 1) {
    destinationPath = options.slug
      ? titleMatches.find((filePath) => path.basename(filePath, ".md") === options.slug)
      : undefined;
    if (!destinationPath) {
      const existingPaths = titleMatches.map((filePath) => path.relative(projectRoot, filePath));
      throw new Error(
        `发现 ${titleMatches.length} 篇同标题文章：${existingPaths.join("、")}。请用 --slug 指定要保留的网址。`,
      );
    }
  } else {
    destinationPath = path.join(blogDirectory, `${requestedSlug}.md`);
  }

  const isUpdate = titleMatches.includes(destinationPath);
  const existingContent = isUpdate ? await readFile(destinationPath, "utf8") : "";
  const existingFrontmatter = existingContent.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? "";
  const slug = path.basename(destinationPath, ".md");
  if (!isUpdate && await fileExists(destinationPath)) {
    throw new Error(`目标文件已存在但标题不同，不会覆盖：${path.relative(projectRoot, destinationPath)}`);
  }

  body = preserveLineBreaks(removeDuplicateTitleHeading(body, title));
  const description = options.description
    || readFrontmatterField(frontmatter, "description")
    || (isUpdate ? readFrontmatterField(existingFrontmatter, "description") : undefined)
    || inferDescription(body, title);
  const pubDate = readFrontmatterField(frontmatter, "pubDate")
    || (isUpdate ? readFrontmatterField(existingFrontmatter, "pubDate") : undefined)
    || getToday();
  const category = options.category
    || readFrontmatterField(frontmatter, "category")
    || (isUpdate ? readFrontmatterField(existingFrontmatter, "category") : undefined)
    || "新手教程";
  const sourcePinned = readFrontmatterField(frontmatter, "pinned");
  const sourceDraft = readFrontmatterField(frontmatter, "draft");
  const pinned = options.pinned || (sourcePinned !== undefined
    ? sourcePinned === "true"
    : isUpdate && readFrontmatterField(existingFrontmatter, "pinned") === "true");
  const draft = options.draft || (sourceDraft !== undefined
    ? sourceDraft === "true"
    : isUpdate && readFrontmatterField(existingFrontmatter, "draft") === "true");

  frontmatter = frontmatterMatch ? frontmatter : existingFrontmatter;
  frontmatter = setFrontmatterField(frontmatter, "title", quoteYaml(title), true);
  frontmatter = setFrontmatterField(frontmatter, "description", quoteYaml(description), true);
  frontmatter = setFrontmatterField(frontmatter, "pubDate", pubDate, true);
  frontmatter = setFrontmatterField(frontmatter, "category", quoteYaml(category), true);
  frontmatter = setFrontmatterField(frontmatter, "pinned", String(pinned), true);
  frontmatter = setFrontmatterField(frontmatter, "draft", String(draft), true);

  const assetRoot = path.join(blogDirectory, "assets", slug);
  const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const imageCopies = new Map();
  let rewrittenBody = "";
  let offset = 0;

  for (const match of body.matchAll(imagePattern)) {
    rewrittenBody += body.slice(offset, match.index);
    const targetMatch = match[2].trim().match(/^(<[^>]+>|\S+)(\s+.*)?$/);
    if (!targetMatch) throw new Error(`无法解析图片链接：${match[0]}`);

    const rawImagePath = targetMatch[1].startsWith("<")
      ? targetMatch[1].slice(1, -1)
      : targetMatch[1];
    const imageTitle = targetMatch[2] ?? "";

    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(rawImagePath)) {
      rewrittenBody += match[0];
    } else {
      let decodedImagePath;
      try {
        decodedImagePath = decodeURIComponent(rawImagePath);
      } catch {
        decodedImagePath = rawImagePath;
      }
      const sourceImagePath = path.resolve(sourceDirectory, decodedImagePath);
      if (!isInside(sourceDirectory, sourceImagePath)) {
        throw new Error(`图片必须位于文章目录内：${rawImagePath}`);
      }
      const imageInfo = await stat(sourceImagePath).catch(() => null);
      if (!imageInfo?.isFile()) throw new Error(`找不到图片文件：${rawImagePath}`);

      const relativeImagePath = path.relative(sourceDirectory, sourceImagePath);
      const outputRelativePath = path.posix.join(
        "assets",
        slug,
        ...relativeImagePath.split(path.sep),
      );
      const destinationImagePath = path.resolve(blogDirectory, ...outputRelativePath.split("/"));
      if (!isInside(assetRoot, destinationImagePath)) {
        throw new Error(`图片路径无效：${rawImagePath}`);
      }
      imageCopies.set(destinationImagePath, sourceImagePath);
      rewrittenBody += `![${match[1]}](${outputRelativePath}${imageTitle})`;
    }
    offset = match.index + match[0].length;
  }
  rewrittenBody += body.slice(offset);

  const output = `---\n${frontmatter.trim()}\n---\n\n${rewrittenBody.trimStart()}`;
  console.log(`${options.dryRun ? "预演" : isUpdate ? "更新已有文章" : "导入"}：${title}`);
  console.log(`文章文件：${path.relative(projectRoot, destinationPath)}`);
  for (const [destinationImagePath, sourceImagePath] of imageCopies) {
    if (await fileExists(destinationImagePath)) {
      const [sourceBytes, destinationBytes] = await Promise.all([
        readFile(sourceImagePath),
        readFile(destinationImagePath),
      ]);
      if (!sourceBytes.equals(destinationBytes)) {
        throw new Error(`目标图片已存在且内容不同：${path.relative(projectRoot, destinationImagePath)}`);
      }
      console.log(`复用图片：${path.relative(projectRoot, destinationImagePath)}`);
    } else {
      console.log(`复制图片：${path.relative(projectRoot, destinationImagePath)}`);
    }
  }

  if (options.dryRun) return;

  for (const [destinationImagePath, sourceImagePath] of imageCopies) {
    if (await fileExists(destinationImagePath)) continue;
    await mkdir(path.dirname(destinationImagePath), { recursive: true });
    await copyFile(sourceImagePath, destinationImagePath);
  }
  await writeFile(destinationPath, `${output}\n`, "utf8");
  console.log("完成。原始 Markdown 和图片保持不变；运行 npm run dev 可预览。");
}

main().catch((error) => {
  console.error(`导入失败：${error.message}`);
  process.exitCode = 1;
});
