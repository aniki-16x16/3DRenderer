import { Mesh } from "../graphics/Mesh";

export class OBJLoader {
  /**
   * 加载并解析 OBJ 文件
   * @param url obj 文件的路径
   */
  async load(url: string): Promise<Mesh> {
    const response = await fetch(url);
    const text = await response.text();
    return this.parse(text);
  }

  /**
   * 解析 OBJ 文本内容
   */
  parse(content: string): Mesh {
    // 1. 原始数据仓库 (从文件中读取的 raw data)
    const rawPositions: number[] = [];
    const rawNormals: number[] = [];
    const rawUVs: number[] = [];

    // 2. 最终推入 GPU 的数据 (展开重组后的数据)
    const finalPositions: number[] = [];
    const finalNormals: number[] = [];
    const finalUVs: number[] = [];
    const finalIndices: number[] = [];

    // 缓存：记录 "vIndex/uvIndex/normIndex" 组合对应的最终顶点索引
    const cache: Record<string, number> = {};
    let nextIndex = 0;

    const lines = content.split("\n");

    // 辅助函数：处理单个顶点字符串 (例如 "1/1/1")
    const processVertex = (vertexString: string): number => {
      // 检查缓存
      if (cache[vertexString] !== undefined) {
        return cache[vertexString];
      }

      const indices = vertexString.split("/");
      // OBJ 索引是从 1 开始的
      const vIndex = parseInt(indices[0]) - 1;
      const tIndex = indices[1] ? parseInt(indices[1]) - 1 : -1;
      const nIndex = indices[2] ? parseInt(indices[2]) - 1 : -1;

      // 提取位置 (必须存在)
      finalPositions.push(
        rawPositions[vIndex * 3 + 0],
        rawPositions[vIndex * 3 + 1],
        rawPositions[vIndex * 3 + 2],
      );

      // 提取 UV (如果没有则填 0,0)
      if (tIndex >= 0) {
        finalUVs.push(rawUVs[tIndex * 2 + 0], rawUVs[tIndex * 2 + 1]);
      } else {
        finalUVs.push(0, 0);
      }

      // 提取法线 (如果没有则填 0,1,0)
      if (nIndex >= 0) {
        finalNormals.push(
          rawNormals[nIndex * 3 + 0],
          rawNormals[nIndex * 3 + 1],
          rawNormals[nIndex * 3 + 2],
        );
      } else {
        finalNormals.push(0, 1, 0);
      }

      const currentIndex = nextIndex;
      cache[vertexString] = currentIndex;
      nextIndex++;

      return currentIndex;
    };

    for (let line of lines) {
      line = line.trim();
      if (line.startsWith("#") || line === "") continue;

      const parts = line.split(/\s+/);
      const type = parts[0];

      if (type === "v") {
        // v x y z
        rawPositions.push(
          parseFloat(parts[1]),
          parseFloat(parts[2]),
          parseFloat(parts[3]),
        );
      } else if (type === "vn") {
        // vn x y z
        rawNormals.push(
          parseFloat(parts[1]),
          parseFloat(parts[2]),
          parseFloat(parts[3]),
        );
      } else if (type === "vt") {
        // vt u v
        // 注意：WebGPU/WebGL 的 V 轴通常与 OBJ 的 V 轴方向相反，可能需要 1.0 - v
        // 这里暂时保持原样，视贴图情况而定
        rawUVs.push(parseFloat(parts[1]), parseFloat(parts[2]));
      } else if (type === "f") {
        // f v1/vt1/vn1 v2/vt2/vn2 v3/vt3/vn3 ...
        const faceVertices = parts.slice(1);

        // 如果是四边形或多边形，进行三角剖分 (Triangle Fan)
        // 0-1-2, 0-2-3, ...
        for (let i = 1; i < faceVertices.length - 1; i++) {
          const indexA = processVertex(faceVertices[0]);
          const indexB = processVertex(faceVertices[i]);
          const indexC = processVertex(faceVertices[i + 1]);

          finalIndices.push(indexA, indexB, indexC);
        }
      }
    }

    return new Mesh(
      new Float32Array(finalPositions),
      // 如果顶点数超过 65535，Mesh 类会自动处理为 Uint32Array
      // 这里我们在 Loader 里先传普通数组即可
      finalIndices,
      new Float32Array(finalNormals),
      new Float32Array(finalUVs),
    );
  }
}
